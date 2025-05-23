import React, { useState, useEffect } from 'react';
import axios from 'axios';

function Contests() {
    const [contests, setContests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updateMsg, setUpdateMsg] = useState('');

    // Fetch contests on component mount
    useEffect(() => {
        const fetchContests = async () => {
            try {
                const response = await axios.get('http://localhost:5001/api/contests');
                setContests(response.data);
                setLoading(false);
            } catch (error) {
                console.error("Error fetching contests:", error);
                setLoading(false);
            }
        };
        fetchContests();
    }, []);

    const updateContests = async () => {
        try {
            await axios.post('http://localhost:5001/api/updateContests');
            // Re-fetch contests after update
            const response = await axios.get('http://localhost:5001/api/contests');
            setContests(response.data);
            setUpdateMsg('Contests updated successfully!');
        } catch (error) {
            console.error("Error updating contests:", error);
            setUpdateMsg('Error updating contests.');
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>Upcoming Contests</h1>
            <button onClick={updateContests} style={{ padding: '10px 20px' }}>
                Update Contests
            </button>
            {updateMsg && <p>{updateMsg}</p>}
            {loading ? (
                <p>Loading contests...</p>
            ) : (
                <div>
                    {contests.map((contest, index) => (
                        <div
                            key={index}
                            style={{
                                border: '1px solid #ccc',
                                margin: '10px 0',
                                padding: '10px'
                            }}
                        >
                            <h2>{contest.name}</h2>
                            <p>
                                <strong>Platform:</strong> {contest.platform}
                            </p>
                            <p>
                                <strong>Start Time:</strong>{' '}
                                {new Date(contest.startTime * 1000).toLocaleString()}
                            </p>
                            <p>
                                <strong>Duration:</strong> {Math.floor(contest.duration / 60)} minutes
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Contests;
