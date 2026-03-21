const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

if (!fs.existsSync(DB_PATH)) {
    console.error('DB file not found at', DB_PATH);
    process.exit(1);
}

try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const email = '2218114919@qq.com';
    
    // Check if users is array or object map
    let user = null;
    let userKey = null;

    if (Array.isArray(data.users)) {
        user = data.users.find(u => u.email === email);
    } else {
        // Object map
        for (const key in data.users) {
            if (data.users[key].email === email) {
                user = data.users[key];
                userKey = key;
                break;
            }
        }
    }

    if (!user) {
        console.log(`User ${email} not found.`);
        process.exit(1);
    }

    console.log(`User found. Current IPs: ${JSON.stringify(user.associated_ips)}`);
    user.associated_ips = [];
    
    // Save back
    // If it was array, 'user' is a reference to the object in the array, so it's updated.
    // If it was object map, 'user' is reference to object in map.
    
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    console.log(`Device limit reset for ${email}. New IPs: []`);

} catch (e) {
    console.error('Error processing DB:', e);
}
