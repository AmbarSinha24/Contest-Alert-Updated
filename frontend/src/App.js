import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

import Login from './components/Login';
import Preferences from './components/Preferences';
import Contests from './components/Contests';
import Account from './components/Account';

function App() {
    return (
        <Router>
            <nav style={{ padding: '10px', background: '#eee' }}>
                <ul style={{ listStyle: 'none', display: 'flex', gap: '1rem' }}>
                    <li><Link to="/">Login</Link></li>
                    <li><Link to="/preferences">Preferences</Link></li>
                    <li><Link to="/contests">Contests</Link></li>
                    <li><Link to="/account">Account</Link></li>
                </ul>
            </nav>

            <Routes>
                {/* The main login page */}
                <Route path="/" element={<Login />} />

                {/* Preferences page */}
                <Route path="/preferences" element={<Preferences />} />

                {/* Contests page */}
                <Route path="/contests" element={<Contests />} />

                {/* Account info page */}
                <Route path="/account" element={<Account />} />
            </Routes>
        </Router>
    );
}

export default App;


