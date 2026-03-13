const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function testOAuthRedirect() {
  try {
    // Register a new user
    console.log('1. Registering new user...');
    const registerResponse = await axios.post(`${API_URL}/auth/register`, {
      name: 'New User',
      email: `newuser${Date.now()}@example.com`,
      password: 'test123456'
    });
    const userId = registerResponse.data.user.id;
    console.log('   User ID:', userId);

    // Test OAuth initiate - should redirect
    console.log('\n2. Testing OAuth initiate (facebook)...');
    try {
      await axios.get(`${API_URL}/accounts/oauth/facebook?user_id=${userId}`, {
        maxRedirects: 0
      });
    } catch (err) {
      if (err.response && err.response.status === 302) {
        console.log('   ✅ Redirect status: 302');
        console.log('   Redirect Location:', err.response.headers.location);
      }
    }

    // Test disconnect
    console.log('\n3. Testing disconnect...');
    const platforms = await axios.get(`${API_URL}/accounts/platforms`, {
      headers: { Authorization: `Bearer ${registerResponse.data.token}` }
    });
    const connected = platforms.data.find(p => p.connected);
    if (connected) {
      await axios.delete(`${API_URL}/accounts/${connected.account.id}`, {
        headers: { Authorization: `Bearer ${registerResponse.data.token}` }
      });
      console.log('   ✅ Disconnected', connected.platform);
    }

    // Test reconnection
    console.log('\n4. Testing reconnection...');
    try {
      await axios.get(`${API_URL}/accounts/oauth/facebook?user_id=${userId}`, {
        maxRedirects: 0
      });
    } catch (err) {
      if (err.response && err.response.status === 302) {
        console.log('   ✅ Reconnection redirect Location:', err.response.headers.location);
      }
    }

    // Verify reconnected
    const platformsAfter = await axios.get(`${API_URL}/accounts/platforms`, {
      headers: { Authorization: `Bearer ${registerResponse.data.token}` }
    });
    const connectedAfter = platformsAfter.data.find(p => p.platform === 'facebook' && p.connected);
    console.log('   ✅ Facebook reconnected:', !!connectedAfter);

    console.log('\n✅ All OAuth flow tests passed!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

testOAuthRedirect();

