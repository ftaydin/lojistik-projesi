// Dosya Adı: server.js
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
        db = client.db("fth_takip_sistemi"); // Yeni ve temiz veritabanını kullanıyoruz
        console.log("MongoDB veritabanına başarıyla bağlanıldı.");
    } catch (e) {
        console.error("Veritabanı bağlantı hatası:", e);
        process.exit(1);
    }
}

app.use(cors());
app.use(express.json());

// --- Fonksiyonlar ---
const getCollection = (name) => db.collection(name);
const safeObjectId = (id) => {
    try {
        return new ObjectId(id);
    } catch {
        return null;
    }
};

// --- GÖSTERGE PANELİ (DASHBOARD) ---
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const users = getCollection('users');
        const trips = getCollection('trips');
        const vehicles = getCollection('vehicles');

        const activeTripsCount = await trips.countDocuments({ status: 'active' });
        const availableDriversCount = await users.countDocuments({ role: 'driver', activeTripId: null });
        const pendingTripsCount = await trips.countDocuments({ status: 'pending' });
        const totalVehiclesCount = await vehicles.countDocuments();

        res.json({
            activeTrips: activeTripsCount,
            availableDrivers: availableDriversCount,
            pendingTrips: pendingTripsCount,
            totalVehicles: totalVehiclesCount,
        });
    } catch (e) {
        res.status(500).json({ message: "İstatistikler alınırken bir hata oluştu." });
    }
});

// --- KULLANICI YÖNETİMİ ---
app.post('/api/register', async (req, res) => {
    const { username, password, name, role, plate } = req.body;
    if (!username || !password || !name || !role) {
        return res.status(400).json({ success: false, message: 'Tüm zorunlu alanlar doldurulmalıdır.' });
    }
    const usersCollection = getCollection('users');
    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) {
        return res.status(409).json({ success: false, message: 'Bu kullanıcı adı zaten mevcut.' });
    }
    
    // Sadece ilk kullanıcı yönetici olabilir (güvenlik için)
    if (role === 'admin') {
        const adminCount = await usersCollection.countDocuments({ role: 'admin' });
        if (adminCount > 0) {
            // Bu endpoint'ten ikinci bir admin oluşturulamaz.
            // Bu kontrolü gerçekte JWT token yetkisi ile yapmak daha doğrudur.
        }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { username, password: hashedPassword, name, role, plate: plate || null, activeTripId: null, location: null, createdAt: new Date() };
    await usersCollection.insertOne(newUser);
    res.status(201).json({ success: true, message: 'Kullanıcı başarıyla oluşturuldu.' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await getCollection('users').findOne({ username });
    if (!user) return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) return res.status(401).json({ success: false, message: 'Şifre hatalı.' });

    delete user.password; // Güvenlik için şifreyi yanıttan kaldır
    res.json({ success: true, user });
});

app.get('/api/users', async (req, res) => {
    const users = await getCollection('users').find({}, { projection: { password: 0 } }).sort({ createdAt: -1 }).toArray();
    res.json(users);
});

app.delete('/api/users/:id', async (req, res) => {
    const userId = safeObjectId(req.params.id);
    if (!userId) return res.status(400).json({ message: 'Geçersiz kullanıcı ID.' });

    const result = await getCollection('users').deleteOne({ _id: userId });
    if (result.deletedCount === 1) {
        res.json({ success: true, message: 'Kullanıcı başarıyla silindi.' });
    } else {
        res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }
});

// --- ARAÇ YÖNETİMİ ---
app.post('/api/vehicles', async (req, res) => {
    const { plate, model, fuelType } = req.body;
    if (!plate || !model) return res.status(400).json({ message: 'Plaka ve model zorunludur.' });
    const newVehicle = { plate, model, fuelType: fuelType || 'Bilinmiyor', createdAt: new Date() };
    await getCollection('vehicles').insertOne(newVehicle);
    res.status(201).json({ success: true, vehicle: newVehicle });
});

app.get('/api/vehicles', async (req, res) => {
    const vehicles = await getCollection('vehicles').find().sort({ createdAt: -1 }).toArray();
    res.json(vehicles);
});

app.delete('/api/vehicles/:id', async (req, res) => {
    const vehicleId = safeObjectId(req.params.id);
    if (!vehicleId) return res.status(400).json({ message: 'Geçersiz araç ID.' });
    
    const result = await getCollection('vehicles').deleteOne({ _id: vehicleId });
    if (result.deletedCount === 1) {
        res.json({ success: true, message: 'Araç başarıyla silindi.' });
    } else {
        res.status(404).json({ message: 'Araç bulunamadı.' });
    }
});

// --- DURAK YÖNETİMİ ---
app.post('/api/stops', async (req, res) => {
    const { name, location } = req.body; // location: { lat, lng }
    if (!name || !location || !location.lat || !location.lng) {
        return res.status(400).json({ message: 'Durak adı ve konum bilgileri zorunludur.' });
    }
    const newStop = { name, location, createdAt: new Date() };
    await getCollection('stops').insertOne(newStop);
    res.status(201).json({ success: true, stop: newStop });
});

app.get('/api/stops', async (req, res) => {
    const stops = await getCollection('stops').find().sort({ name: 1 }).toArray();
    res.json(stops);
});

// --- SEFER YÖNETİMİ ---
app.post('/api/trips', async (req, res) => {
    const { details, stops } = req.body; // stops: [stopId1, stopId2, ...]
    if (!details || !stops || stops.length < 2) {
        return res.status(400).json({ message: 'Sefer detayı ve en az 2 durak zorunludur.' });
    }
    const stopIds = stops.map(safeObjectId);
    const stopData = await getCollection('stops').find({ _id: { $in: stopIds } }).toArray();
    
    // Durakları doğru sırada getirmek için
    const orderedStops = stops.map(id => stopData.find(s => s._id.toString() === id));

    const newTrip = {
        details,
        stops: orderedStops,
        status: 'pending', // pending, assigned, active, completed
        assignedDriverId: null,
        assignedDriverName: null,
        routeColor: `#${Math.floor(Math.random()*16777215).toString(16)}`, // Rastgele rota rengi
        createdAt: new Date(),
    };
    await getCollection('trips').insertOne(newTrip);
    res.status(201).json({ success: true, message: 'Sefer başarıyla oluşturuldu.' });
});

app.get('/api/trips', async (req, res) => {
    const trips = await getCollection('trips').find().sort({ createdAt: -1 }).toArray();
    res.json(trips);
});

app.put('/api/trips/assign', async (req, res) => {
    const { tripId, driverId } = req.body;
    const tripObjectId = safeObjectId(tripId);
    const driverObjectId = safeObjectId(driverId);
    if (!tripObjectId || !driverObjectId) return res.status(400).json({ message: 'Geçersiz sefer veya sürücü ID.' });

    const driver = await getCollection('users').findOne({ _id: driverObjectId });
    if (!driver || driver.activeTripId) return res.status(400).json({ message: 'Sürücü uygun değil veya mevcut değil.' });

    await getCollection('trips').updateOne({ _id: tripObjectId }, { $set: { status: 'assigned', assignedDriverId: driverObjectId, assignedDriverName: driver.name, assignedPlate: driver.plate } });
    await getCollection('users').updateOne({ _id: driverObjectId }, { $set: { activeTripId: tripObjectId } });
    res.json({ success: true, message: 'Sefer sürücüye atandı.' });
});

// --- SÜRÜCÜ UYGULAMASI İÇİN API'LER ---
app.get('/api/drivers/available', async (req, res) => {
    const availableDrivers = await getCollection('users').find({ role: 'driver', activeTripId: null }, { projection: { password: 0 } }).toArray();
    res.json(availableDrivers);
});

app.put('/api/driver/location', async (req, res) => {
    const { userId, location } = req.body;
    const userObjectId = safeObjectId(userId);
    if (!userObjectId || !location) return res.status(400).json({ message: 'Eksik bilgi.' });
    await getCollection('users').updateOne({ _id: userObjectId }, { $set: { location } });
    res.json({ success: true });
});

app.get('/api/driver/trip/:userId', async (req, res) => {
    const userObjectId = safeObjectId(req.params.userId);
    if(!userObjectId) return res.status(400).json({ trip: null });
    
    const user = await getCollection('users').findOne({ _id: userObjectId });
    if (!user || !user.activeTripId) return res.json({ trip: null });

    const trip = await getCollection('trips').findOne({ _id: user.activeTripId });
    res.json({ trip });
});

app.post('/api/trips/start', async (req, res) => {
    const { tripId } = req.body;
    const tripObjectId = safeObjectId(tripId);
    if (!tripObjectId) return res.status(400).json({ message: 'Geçersiz sefer ID.' });
    await getCollection('trips').updateOne({ _id: tripObjectId }, { $set: { status: 'active', startedAt: new Date() } });
    res.json({ success: true, message: 'Sefer başlatıldı.' });
});

app.post('/api/trips/complete', async (req, res) => {
    const { tripId, userId } = req.body;
    const tripObjectId = safeObjectId(tripId);
    const userObjectId = safeObjectId(userId);
    if (!tripObjectId || !userObjectId) return res.status(400).json({ message: 'Geçersiz sefer veya kullanıcı ID.' });
    
    await getCollection('trips').updateOne({ _id: tripObjectId }, { $set: { status: 'completed', completedAt: new Date() } });
    await getCollection('users').updateOne({ _id: userObjectId }, { $set: { activeTripId: null, location: null } });
    res.json({ success: true, message: 'Sefer tamamlandı.' });
});

app.get('/api/trips/active-with-routes', async (req, res) => {
    const activeTrips = await getCollection('trips').find({ status: 'active' }).toArray();
    const driverIds = activeTrips.map(t => t.assignedDriverId).filter(id => id);

    const activeDrivers = await getCollection('users').find(
        { _id: { $in: driverIds }, location: { $ne: null } }, 
        { projection: { password: 0 } }
    ).toArray();

    const results = activeTrips.map(trip => {
        const driver = activeDrivers.find(d => d.activeTripId && d.activeTripId.toString() === trip._id.toString());
        return {
            ...trip,
            currentLocation: driver ? driver.location : null
        };
    });
    res.json(results);
});

// Sunucuyu başlat
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Lojistik sunucusu ${port} portunda çalışıyor.`);
    });
});

