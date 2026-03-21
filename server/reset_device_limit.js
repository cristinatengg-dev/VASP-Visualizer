const mongoose = require('mongoose');
const { User } = require('./models');

const mongoURI = process.env.MONGO_URI || 'mongodb://mongo:27017/sci_visualizer';

const resetDeviceLimit = async () => {
    try {
        await mongoose.connect(mongoURI);
        console.log('MongoDB connected');

        const email = '2218114919@qq.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.log(`User ${email} not found`);
            process.exit(1);
        }

        console.log(`User found. Current IPs: ${user.associated_ips}`);
        user.associated_ips = [];
        await user.save();
        console.log(`Device limit reset for ${email}. New IPs: ${user.associated_ips}`);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

resetDeviceLimit();
