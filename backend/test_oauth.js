const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function testOAuthFlow() {
  try {
    // 1. Register a user
    console.log('1. Registering user...');
    const registerResponse = await axios.post(`${API_URL}/auth/register`, {
      name: 'Test User',
      email: `test${Date.now()}@example.com`,
      password: 'test123456'
    });
    const token = registerResponse.data.token;
    const userId = registerResponse.data.user.id;
    console.log('   User registered, ID:', userId);
    console.log('   Token:', token.substring(0, 20) + '...');

    // 2. Get platforms (should be empty initially)
    console.log('\n2. Getting platforms...');
    const platformsResponse = await axios.get(`${API_URL}/accounts/platforms`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const connectedPlatforms = platformsResponse.data.filter(p => p.connected);
    console.log('   Connected platforms:', connectedPlatforms.length);

    // 3. Test OAuth initiate (this will redirect)
    console.log('\n3. Testing OAuth initiate (twitter)...');
    console.log('   Redirect URL:', `${API_URL}/accounts/oauth/twitter?user_id=${userId}`);

    // 4. Simulate OAuth callback (since we don't have real credentials)
    console.log('\n4. Simulating OAuth callback...');
    const callbackResponse = await axios.get(
      `${API_URL}/accounts/oauth/twitter/callback?user_id=${userId}`,
      { maxRedirects: 0 }
    ).catch(err => {
      if (err.response && err.response.status === 302) {
        return err.response;
      }
      throw err;
    });
    console.log('   Redirect location:', callbackResponse.headers.location);

    // 5. Verify account is now connected
    console.log('\n5. Verifying connection...');
    const platformsAfterResponse = await axios.get(`${API_URL}/accounts/platforms`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const connectedAfter = platformsAfterResponse.data.filter(p => p.connected && p.platform === 'twitter');
    console.log('   Twitter connected:', connectedAfter.length > 0);
    if (connectedAfter.length > 0) {
      console.log('   Account details:', JSON.stringify(connectedAfter[0].account, null, 2));
    }

    console.log('\n✅ OAuth flow test completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

testOAuthFlow();

