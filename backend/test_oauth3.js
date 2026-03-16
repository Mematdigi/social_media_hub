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
      const response = await axios.get(`${API_URL}/accounts/oauth/facebook?user_id=${userId}`, {
        maxRedirects: 0,
        validateStatus: (status) => status < 500
      });
      console.log('   Status:', response.status);
      console.log('   Location:', response.headers.location);
    } catch (err) {
      console.log('   Error:', err.message);
      if (err.response) {
        console.log('   Status:', err.response.status);
        console.log('   Location:', err.response.headers.location);
      }
    }

    // Check if Facebook is connected
    console.log('\n3. Checking connection status...');
    const platforms = await axios.get(`${API_URL}/accounts/platforms`, {
      headers: { Authorization: `Bearer ${registerResponse.data.token}` }
    });
    const fbConnected = platforms.data.find(p => p.platform === 'facebook');
    console.log('   Facebook connected:', fbConnected?.connected || false);
    if (fbConnected?.connected) {
      console.log('   Account:', fbConnected.account?.accountName);
    }

    // Test disconnect
    console.log('\n4. Testing disconnect...');
    if (fbConnected?.connected) {
      await axios.delete(`${API_URL}/accounts/${fbConnected.account.id}`, {
        headers: { Authorization: `Bearer ${registerResponse.data.token}` }
      });
      console.log('   ✅ Disconnected Facebook');
    } else {
      console.log('   Not connected, skipping disconnect');
    }

    console.log('\n✅ Test completed!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

testOAuthRedirect();

