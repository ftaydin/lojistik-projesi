const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const connectionString = process.env.MONGO_URI;

if (!connectionString) {
    console.error("HATA: MONGO_URI ortam değişkeni ayarlanmamış. Lütfen Render.com'da bu değişkeni ayarlayın.");
    process.exit(1);
}

let db;
const client = new MongoClient(connectionString);

async function connectDB() {
    try {
        await client.connect();
        db = client.db("lojistikDB");
        console.log("MongoDB veritabanına başarıyla bağlanıldı.");
    } catch (e) {
        console.error("Veritabanı bağlantı hatası:", e);
        process.exit(1);
    }
}

app.use(cors());
app.use(express.json());

// --- KULLANICI YÖNETİMİ ---
app.post('/api/register', async (req, res) => {
    const { username, password, name, role, plate } = req.body;
    if (!username || !password || !name || !role) {
        return res.status(400).json({ success: false, message: 'Tüm zorunlu alanlar doldurulmalıdır.' });
    }
    const usersCollection = db.collection('users');
    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) {
        return res.status(409).json({ success: false, message: 'Bu kullanıcı adı zaten mevcut.' });
    }
    if (role === 'admin') {
        const adminCount = await usersCollection.countDocuments({ role: 'admin' });
        if (adminCount > 0) {
             // Sadece ilk adminin bu yolla oluşturulmasına izin verilir.
        }
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { username, password: hashedPassword, name, role, plate: plate || null, activeTripId: null, location: null };
    await usersCollection.insertOne(newUser);
    res.status(201).json({ success: true, message: 'Kullanıcı başarıyla oluşturuldu.' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.collection('users').findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) return res.status(401).json({ success: false, message: 'Şifre hatalı.' });
    delete user.password;
    res.json({ success: true, user });
});

app.get('/api/users', async (req, res) => {
    const users = await db.collection('users').find({}, { projection: { password: 0 } }).toArray();
    res.json(users);
});

// --- SÜRÜCÜ İŞLEMLERİ ---
app.get('/api/drivers/available', async (req, res) => {
    const availableDrivers = await db.collection('users').find({ role: 'driver', activeTripId: null }, { projection: { password: 0 } }).toArray();
    res.json(availableDrivers);
});

app.put('/api/driver/location', async (req, res) => {
    const { userId, location } = req.body;
    if (!userId || !location) return res.status(400).json({ message: 'Eksik bilgi.' });
    try {
        await db.collection('users').updateOne({ _id: new ObjectId(userId) }, { $set: { location } });
        res.json({ success: true });
    } catch(e) { res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID.' }); }
});

app.get('/api/driver/trip/:userId', async (req, res) => {
    try {
        const user = await db.collection('users').findOne({ _id: new ObjectId(req.params.userId) });
        if (!user || !user.activeTripId) return res.json({ trip: null });
        const trip = await db.collection('trips').findOne({ _id: new ObjectId(user.activeTripId) });
        res.json({ trip });
    } catch(e) { res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID.' }); }
});

// --- SEFER YÖNETİMİ ---
app.post('/api/trips', async (req, res) => {
    const { origin, destination, details } = req.body;
    const newTrip = { origin, destination, details, status: 'pending', assignedDriverId: null, assignedDriverName: null, createdAt: new Date() };
    await db.collection('trips').insertOne(newTrip);
    res.status(201).json({ success: true, message: 'Sefer başarıyla oluşturuldu.' });
});

app.get('/api/trips', async (req, res) => {
    const trips = await db.collection('trips').find().sort({ createdAt: -1 }).toArray();
    res.json(trips);
});

app.put('/api/trips/assign', async (req, res) => {
    const { tripId, driverId } = req.body;
    try {
        const driver = await db.collection('users').findOne({ _id: new ObjectId(driverId) });
        if (!driver || driver.activeTripId) return res.status(400).json({ message: 'Sürücü uygun değil veya mevcut değil.' });
        await db.collection('trips').updateOne({ _id: new ObjectId(tripId) }, { $set: { status: 'assigned', assignedDriverId: new ObjectId(driverId), assignedDriverName: driver.name } });
        await db.collection('users').updateOne({ _id: new ObjectId(driverId) }, { $set: { activeTripId: new ObjectId(tripId) } });
        res.json({ success: true, message: 'Sefer sürücüye atandı.' });
    } catch(e) { res.status(400).json({ success: false, message: 'Geçersiz sefer veya sürücü ID.' }); }
});

app.post('/api/trips/start', async (req, res) => {
    const { tripId } = req.body;
    try {
        await db.collection('trips').updateOne({ _id: new ObjectId(tripId) }, { $set: { status: 'active', startedAt: new Date() } });
        res.json({ success: true, message: 'Sefer başlatıldı.' });
    } catch(e) { res.status(400).json({ success: false, message: 'Geçersiz sefer ID.' }); }
});

app.post('/api/trips/complete', async (req, res) => {
    const { tripId, userId } = req.body;
    try {
        await db.collection('trips').updateOne({ _id: new ObjectId(tripId) }, { $set: { status: 'completed', completedAt: new Date() } });
        await db.collection('users').updateOne({ _id: new ObjectId(userId) }, { $set: { activeTripId: null, location: null } });
        res.json({ success: true, message: 'Sefer tamamlandı.' });
    } catch(e) { res.status(400).json({ success: false, message: 'Geçersiz sefer veya kullanıcı ID.' }); }
});

app.get('/api/trips/active-locations', async (req, res) => {
    const activeDrivers = await db.collection('users').find({ role: 'driver', activeTripId: { $ne: null }, location: { $ne: null } }, { projection: { password: 0 } }).toArray();
    res.json(activeDrivers);
});

// Sunucuyu başlat
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Lojistik sunucusu ${port} portunda çalışıyor.`);
    });
});
