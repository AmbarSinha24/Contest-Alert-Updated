import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Login() {
    const [user, setUser] = useState(null); // null = not logged in
    const [message, setMessage] = useState('');

    useEffect(() => {
        async function fetchUser() {
            try {
                // Check if user is logged in
                const res = await axios.get('http://localhost:5001/api/user/info', {
                    withCredentials: true
                });
                setUser(res.data); // e.g. { name, email, reminderPreferences }
            } catch (error) {
                // If 401 or user not found, user = null
                setUser(null);
            }
        }
        fetchUser();
    }, []);

    const handleLogout = async () => {
        try {
            // Passport >= 0.6.0 requires a callback in req.logout
            await axios.get('http://localhost:5001/auth/logout', {
                withCredentials: true
            });
            // Clear user from state
            setUser(null);
            // Show success message
            setMessage('Signed out successfully.');
        } catch (error) {
            console.error("Logout failed:", error);
            setMessage('Error signing out. Please try again.');
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>Login</h1>

            {/* If user is not logged in, show "Login with Google" */}
            {!user && (
                <>
                    <p>Click the button below to log in with Google.</p>
                    <a href="http://localhost:5001/auth/google">
                        <button style={{ padding: '10px 20px', fontSize: '16px' }}>
                            Login with Google
                        </button>
                    </a>
                </>
            )}

            {/* If user is logged in, show "Already logged in" + sign out button */}
            {user && (
                <>
                    <p>Already logged in as: <strong>{user.email}</strong></p>
                    <button
                        style={{ padding: '10px 20px', fontSize: '16px' }}
                        onClick={handleLogout}
                    >
                        Sign Out
                    </button>
                </>
            )}

            {/* If there's a message, show it below the login/sign-out section */}
            {message && (
                <p style={{ marginTop: '1rem', color: 'green' }}>{message}</p>
            )}
        </div>
    );
}

export default Login;

