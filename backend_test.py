#!/usr/bin/env python3
"""
SocialHub Backend API Testing Suite
Tests all authentication, accounts, and posts endpoints
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class SocialHubAPITester:
    def __init__(self, base_url: str = "https://social-mgmt-hub-1.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data
        self.test_user = {
            "name": "Test User",
            "email": "test@example.com", 
            "password": "password123"
        }
        
        print(f"🚀 Starting SocialHub API Tests")
        print(f"📍 Base URL: {self.base_url}")
        print("=" * 60)

    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "details": details,
            "response_data": response_data
        })

    def make_request(self, method: str, endpoint: str, data: Optional[Dict] = None, 
                    expected_status: int = 200) -> tuple[bool, Dict]:
        """Make HTTP request and validate response"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                return False, {"error": f"Unsupported method: {method}"}
            
            success = response.status_code == expected_status
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}
            
            if not success:
                print(f"   Status: {response.status_code} (expected {expected_status})")
                if response_data:
                    print(f"   Response: {json.dumps(response_data, indent=2)}")
            
            return success, response_data
            
        except requests.exceptions.RequestException as e:
            return False, {"error": str(e)}

    def test_auth_register(self):
        """Test user registration"""
        success, response = self.make_request(
            'POST', 'auth/register', 
            self.test_user, 
            expected_status=200
        )
        
        if success and 'token' in response and 'user' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            self.log_test("User Registration", True, response_data=response['user'])
        else:
            # Try login if user already exists
            if 'already registered' in str(response):
                self.log_test("User Registration", True, "User already exists, proceeding with login")
                return self.test_auth_login()
            else:
                self.log_test("User Registration", False, f"Registration failed: {response}")
        
        return success

    def test_auth_login(self):
        """Test user login"""
        login_data = {
            "email": self.test_user["email"],
            "password": self.test_user["password"]
        }
        
        success, response = self.make_request(
            'POST', 'auth/login', 
            login_data, 
            expected_status=200
        )
        
        if success and 'token' in response and 'user' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            self.log_test("User Login", True, response_data=response['user'])
        else:
            self.log_test("User Login", False, f"Login failed: {response}")
        
        return success

    def test_auth_me(self):
        """Test get current user"""
        if not self.token:
            self.log_test("Get Current User", False, "No token available")
            return False
        
        success, response = self.make_request('GET', 'auth/me')
        
        if success and 'id' in response and 'email' in response:
            self.log_test("Get Current User", True, response_data=response)
        else:
            self.log_test("Get Current User", False, f"Failed: {response}")
        
        return success

    def test_accounts_platforms(self):
        """Test get platforms list"""
        if not self.token:
            self.log_test("Get Platforms", False, "No token available")
            return False
        
        success, response = self.make_request('GET', 'accounts/platforms')
        
        if success and isinstance(response, list) and len(response) == 25:
            platforms_with_oauth = [p for p in response if p.get('oauthSupported')]
            self.log_test("Get Platforms", True, f"Found {len(response)} platforms, {len(platforms_with_oauth)} with OAuth")
        else:
            self.log_test("Get Platforms", False, f"Expected 25 platforms, got: {len(response) if isinstance(response, list) else 'invalid response'}")
        
        return success

    def test_oauth_flow(self):
        """Test OAuth connection flow"""
        if not self.token or not self.user_id:
            self.log_test("OAuth Flow", False, "No token or user_id available")
            return False
        
        # Test connecting to Facebook (first platform with OAuth support)
        platform = "facebook"
        
        # Step 1: Initiate OAuth
        success1, response1 = self.make_request('GET', f'accounts/oauth/{platform}')
        
        if not success1:
            self.log_test("OAuth Initiate", False, f"Failed to initiate OAuth: {response1}")
            return False
        
        # Step 2: Simulate callback
        success2, response2 = self.make_request(
            'GET', f'accounts/oauth/{platform}/callback?user_id={self.user_id}'
        )
        
        if success2:
            self.log_test("OAuth Flow", True, f"Successfully connected {platform}")
            return True
        else:
            self.log_test("OAuth Flow", False, f"Callback failed: {response2}")
            return False

    def test_accounts_list(self):
        """Test get connected accounts"""
        if not self.token:
            self.log_test("Get Accounts", False, "No token available")
            return False
        
        success, response = self.make_request('GET', 'accounts')
        
        if success and isinstance(response, list):
            self.log_test("Get Accounts", True, f"Found {len(response)} connected accounts")
            return response  # Return accounts for later use
        else:
            self.log_test("Get Accounts", False, f"Failed: {response}")
            return []

    def test_posts_crud(self):
        """Test complete posts CRUD operations"""
        if not self.token:
            self.log_test("Posts CRUD", False, "No token available")
            return False
        
        # Get connected accounts first
        accounts = self.test_accounts_list()
        if not accounts:
            self.log_test("Posts CRUD", False, "No connected accounts for testing")
            return False
        
        account_ids = [acc['id'] for acc in accounts[:1]]  # Use first account
        
        # Test 1: Create Post
        post_data = {
            "content": "Test post from API testing suite",
            "accountIds": account_ids,
            "mediaUrls": [],
            "status": "draft"
        }
        
        success, response = self.make_request(
            'POST', 'posts', 
            post_data, 
            expected_status=200
        )
        
        if not success or 'id' not in response:
            self.log_test("Create Post", False, f"Failed: {response}")
            return False
        
        post_id = response['id']
        self.log_test("Create Post", True, f"Created post {post_id}")
        
        # Test 2: Get All Posts
        success, posts = self.make_request('GET', 'posts')
        if success and isinstance(posts, list):
            self.log_test("Get All Posts", True, f"Retrieved {len(posts)} posts")
        else:
            self.log_test("Get All Posts", False, f"Failed: {posts}")
        
        # Test 3: Get Single Post
        success, post = self.make_request('GET', f'posts/{post_id}')
        if success and post.get('id') == post_id:
            self.log_test("Get Single Post", True)
        else:
            self.log_test("Get Single Post", False, f"Failed: {post}")
        
        # Test 4: Update Post
        update_data = {
            "content": "Updated test post content",
            "status": "published"
        }
        
        success, updated_post = self.make_request(
            'PUT', f'posts/{post_id}', 
            update_data
        )
        
        if success and updated_post.get('content') == update_data['content']:
            self.log_test("Update Post", True)
        else:
            self.log_test("Update Post", False, f"Failed: {updated_post}")
        
        # Test 5: Delete Post
        success, response = self.make_request(
            'DELETE', f'posts/{post_id}', 
            expected_status=200
        )
        
        if success:
            self.log_test("Delete Post", True)
        else:
            self.log_test("Delete Post", False, f"Failed: {response}")
        
        return True

    def test_account_disconnect(self):
        """Test disconnecting an account"""
        if not self.token:
            self.log_test("Disconnect Account", False, "No token available")
            return False
        
        # Get connected accounts
        accounts = self.test_accounts_list()
        if not accounts:
            self.log_test("Disconnect Account", False, "No accounts to disconnect")
            return False
        
        account_id = accounts[0]['id']
        
        success, response = self.make_request(
            'DELETE', f'accounts/{account_id}', 
            expected_status=200
        )
        
        if success:
            self.log_test("Disconnect Account", True, f"Disconnected account {account_id}")
        else:
            self.log_test("Disconnect Account", False, f"Failed: {response}")
        
        return success

    def test_scheduler_apis(self):
        """Test Phase 3 - Scheduler APIs"""
        if not self.token:
            self.log_test("Scheduler APIs", False, "No token available")
            return False
        
        print("\n📅 Testing Scheduler APIs...")
        
        # Test 1: Get Calendar Data
        success, response = self.make_request('GET', 'scheduler/calendar?month=3&year=2026')
        if success and isinstance(response, dict):
            self.log_test("Scheduler Calendar API", True, f"Calendar data retrieved")
        else:
            self.log_test("Scheduler Calendar API", False, f"Failed: {response}")
        
        # Test 2: Create Scheduled Post
        accounts = self.test_accounts_list()
        if accounts:
            account_ids = [accounts[0]['id']]
            scheduled_post_data = {
                "content": "Test scheduled post",
                "accountIds": account_ids,
                "mediaUrls": [],
                "status": "scheduled",
                "scheduledAt": "2026-03-15T10:00:00Z"
            }
            
            success, response = self.make_request('POST', 'posts', scheduled_post_data)
            if success and response.get('status') == 'scheduled':
                post_id = response['id']
                self.log_test("Create Scheduled Post", True, f"Scheduled post {post_id}")
                
                # Test 3: Force Publish Post
                success, response = self.make_request('POST', f'posts/{post_id}/publish')
                if success:
                    self.log_test("Force Publish Post", True, f"Published post {post_id}")
                else:
                    self.log_test("Force Publish Post", False, f"Failed: {response}")
            else:
                self.log_test("Create Scheduled Post", False, f"Failed: {response}")
        
        return True

    def test_inbox_apis(self):
        """Test Phase 4 - Inbox APIs"""
        if not self.token:
            self.log_test("Inbox APIs", False, "No token available")
            return False
        
        print("\n📨 Testing Inbox APIs...")
        
        # Test 1: Sync Inbox (to generate messages)
        success, response = self.make_request('POST', 'inbox/sync')
        if success:
            self.log_test("Inbox Sync", True, f"Synced {response.get('synced', 0)} accounts")
        else:
            self.log_test("Inbox Sync", False, f"Failed: {response}")
        
        # Test 2: Get Messages
        success, response = self.make_request('GET', 'inbox')
        if success and 'messages' in response:
            messages = response['messages']
            self.log_test("Get Inbox Messages", True, f"Retrieved {len(messages)} messages")
            
            # Test 3: Get Unread Count
            success, response = self.make_request('GET', 'inbox/unread-count')
            if success and 'total' in response:
                self.log_test("Get Unread Count", True, f"Unread count: {response['total']}")
            else:
                self.log_test("Get Unread Count", False, f"Failed: {response}")
            
            # Test with filters
            success, response = self.make_request('GET', 'inbox?platform=facebook&type=dm')
            if success:
                self.log_test("Get Filtered Messages", True, f"Filtered messages retrieved")
            else:
                self.log_test("Get Filtered Messages", False, f"Failed: {response}")
            
            # Test 4: Mark Message as Read (if messages exist)
            if messages:
                message_id = messages[0]['id']
                success, response = self.make_request('PUT', f'inbox/{message_id}/read')
                if success:
                    self.log_test("Mark Message Read", True, f"Marked message {message_id} as read")
                    
                    # Test 5: Reply to Message
                    reply_data = {"content": "Thank you for your message!"}
                    success, response = self.make_request('POST', f'inbox/{message_id}/reply', reply_data)
                    if success:
                        self.log_test("Reply to Message", True, f"Replied to message {message_id}")
                    else:
                        self.log_test("Reply to Message", False, f"Failed: {response}")
                else:
                    self.log_test("Mark Message Read", False, f"Failed: {response}")
        else:
            self.log_test("Get Inbox Messages", False, f"Failed: {response}")
        
        return True

    def test_analytics_apis(self):
        """Test Phase 5 - Analytics APIs"""
        if not self.token:
            self.log_test("Analytics APIs", False, "No token available")
            return False
        
        print("\n📊 Testing Analytics APIs...")
        
        # Test 1: Sync Analytics (to generate data)
        success, response = self.make_request('POST', 'analytics/sync')
        if success:
            self.log_test("Analytics Sync", True, f"Synced {response.get('synced', 0)} accounts")
        else:
            self.log_test("Analytics Sync", False, f"Failed: {response}")
        
        # Test 2: Get Analytics Overview
        success, response = self.make_request('GET', 'analytics/overview')
        if success and 'totalFollowers' in response:
            self.log_test("Analytics Overview", True, f"Overview data retrieved")
        else:
            self.log_test("Analytics Overview", False, f"Failed: {response}")
        
        # Test 3: Get Followers Chart Data
        success, response = self.make_request('GET', 'analytics/followers')
        if success and 'dates' in response and 'series' in response:
            self.log_test("Followers Chart Data", True, f"Chart data retrieved")
        else:
            self.log_test("Followers Chart Data", False, f"Failed: {response}")
        
        # Test 4: Get Engagement Chart Data
        success, response = self.make_request('GET', 'analytics/engagement')
        if success and 'platforms' in response and 'metrics' in response:
            self.log_test("Engagement Chart Data", True, f"Engagement data retrieved")
        else:
            self.log_test("Engagement Chart Data", False, f"Failed: {response}")
        
        # Test 5: Get Top Posts
        success, response = self.make_request('GET', 'analytics/posts')
        if success and isinstance(response, list):
            self.log_test("Top Posts Data", True, f"Retrieved {len(response)} top posts")
        else:
            self.log_test("Top Posts Data", False, f"Failed: {response}")
        
        # Test with date range parameters
        success, response = self.make_request('GET', 'analytics/overview?startDate=2024-01-01&endDate=2024-12-31')
        if success:
            self.log_test("Analytics with Date Range", True, f"Date range filtering works")
        else:
            self.log_test("Analytics with Date Range", False, f"Failed: {response}")
        
        return True

    def run_all_tests(self):
        """Run complete test suite"""
        print("🔐 Testing Authentication...")
        
        # Auth tests
        if not self.test_auth_register():
            if not self.test_auth_login():
                print("❌ Authentication failed, stopping tests")
                return self.print_summary()
        
        self.test_auth_me()
        
        print("\n🔗 Testing Accounts Management...")
        
        # Accounts tests
        self.test_accounts_platforms()
        self.test_oauth_flow()
        
        print("\n📝 Testing Posts Management...")
        
        # Posts tests
        self.test_posts_crud()
        
        # Phase 3+4+5 Tests
        self.test_scheduler_apis()
        self.test_inbox_apis()
        self.test_analytics_apis()
        
        print("\n🔌 Testing Account Disconnection...")
        
        # Cleanup test
        self.test_account_disconnect()
        
        return self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("❌ Some tests failed")
            
            # Show failed tests
            failed_tests = [t for t in self.test_results if not t['success']]
            if failed_tests:
                print("\nFailed Tests:")
                for test in failed_tests:
                    print(f"  - {test['name']}: {test['details']}")
            
            return 1

def main():
    """Main test runner"""
    tester = SocialHubAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())