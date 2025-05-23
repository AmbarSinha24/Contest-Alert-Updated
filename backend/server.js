require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { Sequelize, DataTypes, Op } = require('sequelize');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ----- 1) Initialize Sequelize (MySQL) -----
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: false,
        pool: { max: 5, min: 0, idle: 10000 }
    }
);

// Test DB connection\sequelize.authenticate()
// Test DB connection
sequelize.authenticate()
    .then(() => console.log('🔗 MySQL connected'))
    .catch(err => console.error('MySQL connection error:', err));


// ----- 2) Define Models -----
const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    googleId: { type: DataTypes.STRING, unique: true, allowNull: false },
    name: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING, unique: true }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

const Platform = sequelize.define('Platform', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, unique: true }
}, {
    tableName: 'platforms',
    timestamps: false
});

const ContestType = sequelize.define('ContestType', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false }
}, {
    tableName: 'contest_types',
    timestamps: false
});

// Join table: which user wants which contest types
const ReminderPreference = sequelize.define('ReminderPreference', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }
}, {
    tableName: 'reminder_preferences',
    timestamps: false
});

const Contest = sequelize.define('Contest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    startTime: { type: DataTypes.INTEGER, allowNull: false },
    duration: { type: DataTypes.INTEGER, allowNull: false }
}, {
    tableName: 'contests',
    timestamps: false
});

// ----- 3) Associations -----
User.belongsToMany(ContestType, { through: ReminderPreference });
ContestType.belongsToMany(User, { through: ReminderPreference });

Platform.hasMany(Contest);
Contest.belongsTo(Platform);
ContestType.hasMany(Contest);
Contest.belongsTo(ContestType);

// ----- 4) Sync Models -----
sequelize.sync({ alter: true })
    .then(() => console.log('✅ Models synced'))
    .catch(err => console.error('Sync error:', err));

// ----- 5) Session & Passport Setup -----
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const [user] = await User.findOrCreate({
            where: { googleId: profile.id },
            defaults: { name: profile.displayName, email: profile.emails[0].value }
        });
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findByPk(id);
        done(null, user || null);
    } catch (err) {
        done(err, null);
    }
});

// ----- 6) Auth Routes -----
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => res.redirect('http://localhost:3000')
);
app.get('/auth/logout', (req, res) => {
    req.logout(err => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.json({ message: 'Signed out successfully.' });
        });
    });
});

// ----- 7) User Preferences Endpoints -----
// Get all available contest types
app.get('/api/contest-types', async (req, res) => {
    const types = await ContestType.findAll();
    res.json(types);
});

// Update user's reminder preferences
app.post('/api/user/preferences', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const { contestTypeIds } = req.body; // e.g. [1, 2, 5]
    try {
        await req.user.setContestTypes(contestTypeIds);
        res.json({ message: 'Preferences updated' });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// Get user's reminder preferences
app.get('/api/user/preferences', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const prefs = await req.user.getContestTypes();
    res.json(prefs);
});

app.get('/api/user/info', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // Load the user’s contest‐type preferences
    const prefs = await req.user.getContestTypes({
        attributes: ['id', 'name']
    });

    res.json({
        name: req.user.name,
        email: req.user.email,
        preferences: prefs   // e.g. [{ id: 1, name: 'Weekly' }, …]
    });
});

// ----- 8) Contest Fetch & Update -----
// async function fetchCodeforcesContests() {
//     try {
//         const { data } = await axios.get('https://codeforces.com/api/contest.list');
//         return data.result.filter(c => c.phase === 'BEFORE').map(c => ({
//             platformName: 'Codeforces',
//             name: c.name,
//             startTime: c.startTimeSeconds,
//             duration: c.durationSeconds,
//             typeName: c.name.match(/Div\.\d/)?.[0] || 'Other'
//         }));
//     } catch (e) { console.error('CF fetch error:', e); return []; }
// }

// async function fetchCodeforcesContests() {
//     try {
//         const { data } = await axios.get('https://codeforces.com/api/contest.list');

//         return data.result
//             .filter(c => c.phase === 'BEFORE')
//             .map(c => {
//                 const match = c.name.match(/Div[.\s]?(\d)/); // match Div.1 or Div 2 or Div3
//                 const typeName = match ? `Div${match[1]}` : 'Other'; // Normalize to Div1, Div2, etc.

//                 return {
//                     platformName: 'Codeforces',
//                     name: c.name,
//                     startTime: c.startTimeSeconds,
//                     duration: c.durationSeconds,
//                     typeName
//                 };
//             });

//     } catch (e) {
//         console.error('CF fetch error:', e);
//         return [];
//     }
// }
function parseCodeforcesType(name) {
    if (/Div\. 1/i.test(name)) return 'Div1';
    if (/Div\. 2/i.test(name)) return 'Div2';
    if (/Div\. 3/i.test(name)) return 'Div3';
    if (/Div\. 4/i.test(name)) return 'Div4';
    if (/Educational/i.test(name)) return 'Div2'; // Optional: map Educational to Div2
    return 'Other';
}
``
async function fetchCodeforcesContests() {
    const response = await fetch('https://codeforces.com/api/contest.list');
    const json = await response.json();

    if (json.status !== 'OK') {
        throw new Error('Failed to fetch Codeforces contests');
    }

    const now = Math.floor(Date.now() / 1000);

    const upcoming = json.result
        .filter(contest => contest.phase === 'BEFORE' && contest.startTimeSeconds > now)
        .map(contest => ({
            platformName: 'Codeforces',
            name: contest.name,
            startTime: contest.startTimeSeconds,
            duration: contest.durationSeconds,
            typeName: parseCodeforcesType(contest.name)  // Apply parsing logic here
        }));

    return upcoming;
}




function getNextWeeklyContest(now) {
    let days = (7 - now.getDay()) % 7;
    if (now.getDay() === 0) { let t = new Date(now); t.setUTCHours(14, 30, 0, 0); days = now < t ? 0 : 7; }
    let d = new Date(now); d.setDate(d.getDate() + days); d.setUTCHours(14, 30, 0, 0);
    return d;
}

function getNextBiweeklyContest(now) {
    const ref = new Date(Date.UTC(2022, 0, 8, 14, 30, 0));
    const ms = 24 * 60 * 60 * 1000;
    const diff = Math.floor((now - ref) / ms);
    const periods = Math.floor(diff / 14);
    let cand = new Date(ref.getTime() + periods * 14 * ms);
    cand.setUTCHours(14, 30, 0, 0);
    if (cand <= now) cand = new Date(cand.getTime() + 14 * ms);
    return cand;
}

function computeUpcomingLeetCodeContests() {
    const now = new Date();
    const w1 = getNextWeeklyContest(now);
    const w2 = new Date(w1.getTime() + 7 * 24 * 60 * 60 * 1000);
    const b1 = getNextBiweeklyContest(now);
    const b2 = new Date(b1.getTime() + 14 * 24 * 60 * 60 * 1000);
    const contests = [
        { platformName: 'LeetCode', name: 'LeetCode Weekly Contest', startTime: Math.floor(w1 / 1000), duration: 5400, typeName: 'Weekly' },
        { platformName: 'LeetCode', name: 'LeetCode Weekly Contest', startTime: Math.floor(w2 / 1000), duration: 5400, typeName: 'Weekly' },
        { platformName: 'LeetCode', name: 'LeetCode Biweekly Contest', startTime: Math.floor(b1 / 1000), duration: 5400, typeName: 'Biweekly' },
        { platformName: 'LeetCode', name: 'LeetCode Biweekly Contest', startTime: Math.floor(b2 / 1000), duration: 5400, typeName: 'Biweekly' }
    ];
    return contests.filter(c => c.startTime > Math.floor(now / 1000)).sort((a, b) => a.startTime - b.startTime).slice(0, 3);
}
function parseCodeforcesType(name) {
    if (/Div\. 1/i.test(name)) return 'Div1';
    if (/Div\. 2/i.test(name)) return 'Div2';
    if (/Div\. 3/i.test(name)) return 'Div3';
    if (/Div\. 4/i.test(name)) return 'Div4';
    if (/Educational/i.test(name)) return 'Div2'; // Optional logic
    return 'Other';
}

app.post('/api/updateContests', async (req, res) => {
    try {
        const cfData = await fetchCodeforcesContests();
        const lcData = computeUpcomingLeetCodeContests();
        const allData = [...cfData, ...lcData];
        const fixedTypeMap = {
            'Weekly': 1,
            'Biweekly': 2,
            'Other': 7,
            'Div1': 3,
            'Div2': 4,
            'Div3': 5,
            'Div4': 6
        };

        // Upsert Platforms and ContestTypes
        const platforms = {};
        const types = {};
        for (const row of allData) {
            if (!platforms[row.platformName]) {
                platforms[row.platformName] = await Platform.findOrCreate({ where: { name: row.platformName } }).then(r => r[0]);
            }
            if (!types[row.typeName]) {
                const id = fixedTypeMap[row.typeName] || fixedTypeMap['Other'];
                types[row.typeName] = await ContestType.findByPk(id);
            }
        }

        // Reset contests
        await Contest.destroy({ where: {} });
        // Bulk create contests with FK ids
        for (const row of allData) {
            await Contest.create({
                name: row.name,
                startTime: row.startTime,
                duration: row.duration,
                PlatformId: platforms[row.platformName].id,
                ContestTypeId: types[row.typeName].id
            });
        }

        res.json({ message: 'Contests updated', count: allData.length });
    } catch (err) { console.error('Update error:', err); res.status(500).json({ error: 'Failed to update contests' }); }
});

app.get('/api/contests', async (req, res) => {
    const contests = await Contest.findAll({
        include: [Platform, ContestType],
        order: [['startTime', 'ASC']]
    });
    res.json(contests);
});

// ----- 9) Email Reminders via Cron -----
const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
cron.schedule('* * * * *', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const remSec = nowSec + 20 * 60;
    const upcoming = await Contest.findAll({ where: { startTime: { [Op.between]: [remSec - 30, remSec + 30] } }, include: ContestType });

    for (const contest of upcoming) {
        const users = await contest.ContestType.getUsers();
        for (const u of users) {
            const mail = {
                from: process.env.EMAIL_USER,
                to: u.email,
                subject: `Reminder: ${contest.name} starts soon!`,
                text: `Hi ${u.name},\n\n${contest.name} starts at ${new Date(contest.startTime * 1000).toLocaleString()}.\n\nGood luck!`
            };
            try { await transporter.sendMail(mail); } catch (e) { console.error(`Email to ${u.email} failed:`, e); }
            await new Promise(r => setTimeout(r, 1000));
        }
    }
});

// ----- 10) Start Server -----
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
