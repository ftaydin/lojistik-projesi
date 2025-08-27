// Dosya Adı: server.js

const express = require('express');
const cors = require('cors');
const app = express();
// Render'ın verdiği portu kullan, bulamazsan 3000'i kullan
const port = process.env.PORT || 3000; 

app.use(cors());
app.use(express.json());

let database = {
    activeTrip: null,
    driverMessages: [],
};

// API Endpoint'leri
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    if (username.includes('532')) {
        res.json({ success: true, role: 'driver', name: 'Ahmet Yılmaz' });
    } else if (username.includes('ali')) {
        res.json({ success: true, role: 'admin', name: 'Ali Veli' });
    } else {
        res.status(401).json({ success: false, message: 'Kullanıcı bulunamadı' });
    } 
});

app.get('/api/trips/active', (req, res) => {
    res.json({ activeTrip: database.activeTrip });
});

app.post('/api/trips/start', (req, res) => {
    const { consignmentNumber } = req.body;
    if (database.activeTrip) {
        return res.status(400).json({ success: false, message: 'Zaten aktif bir sefer var.' });
    }
    database.activeTrip = { id: 'trip' + Date.now(), driver: 'Ahmet Yılmaz', plate: '34 ABC 123', consignment: consignmentNumber, destination: 'İzmir Aktarma Merkezi', status: 'Zamanında', eta: '14:30', location: { top: '30%', left: '40%' } };
    setTimeout(() => { if(database.activeTrip) database.activeTrip.location = { top: '60%', left: '65%' }; }, 5000);
    res.json({ success: true, trip: database.activeTrip });
});

app.post('/api/trips/complete', (req, res) => {
    if (database.activeTrip) {
        database.activeTrip = null;
        res.json({ success: true, message: 'Sefer tamamlandı.' });
    } else {
        res.status(400).json({ success: false, message: 'Tamamlanacak aktif sefer yok.' });
    } 
});

app.post('/api/messages/send', (req, res) => {
    const { message } = req.body;
    const newMessage = { from: 'Yönetici', content: message, time: new Date() };
    database.driverMessages.push(newMessage);
    res.json({ success: true, message: 'Mesaj gönderildi.' });
});

app.get('/api/messages', (req, res) => {
    res.json({ messages: database.driverMessages });
});

app.listen(port, () => {
    console.log(`Lojistik sunucusu ${port} portunda çalışıyor.`);
});
