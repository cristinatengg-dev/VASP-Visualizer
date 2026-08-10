const mongoose = require('mongoose');
const { User } = require('./models');
const { normalizePhoneNumber } = require('./src/auth/phone-auth');

const mongoURI = process.env.MONGO_URI || 'mongodb://mongo:27017/sci_visualizer';

const resetDeviceLimit = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('MongoDB connected');

        const phone = normalizePhoneNumber(process.argv[2]);
        if (!phone) throw new Error('Usage: node reset_device_limit.js <phone>');
        const user = await User.findOne({ phone });

        if (!user) {
            console.log(`User ${phone} not found`);
            process.exit(1);
        }

        console.log(`User found. Current IPs: ${user.associated_ips}`);
        user.associated_ips = [];
        await user.save();
        console.log(`Device limit reset for ${phone}. New IPs: ${user.associated_ips}`);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

resetDeviceLimit();
