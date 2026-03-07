from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
import random

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'socialhub_super_secret_jwt_key_2024')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Encryption key for tokens
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', 'socialhub_32_char_encryption_key')

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Security
security = HTTPBearer()

# ============ MODELS ============

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    avatar: str = ""
    role: str = "admin"
    createdAt: str

class AuthResponse(BaseModel):
    token: str
    user: UserResponse

class SocialAccountResponse(BaseModel):
    id: str
    userId: str
    platform: str
    accountName: str
    accountId: str
    profilePicture: str
    isActive: bool
    followers: int
    connectedAt: str

class PlatformInfo(BaseModel):
    platform: str
    name: str
    color: str
    oauthSupported: bool
    connected: bool = False
    account: Optional[SocialAccountResponse] = None

# Post Models (Updated for Phase 3)
class PlatformResult(BaseModel):
    platform: str
    accountId: str
    platformPostId: Optional[str] = None
    status: str = "pending"
    error: Optional[str] = None
    publishedAt: Optional[str] = None

class PostCreate(BaseModel):
    content: str
    accountIds: List[str]
    mediaUrls: List[str] = []
    status: str = "draft"
    scheduledAt: Optional[str] = None

class PostUpdate(BaseModel):
    content: Optional[str] = None
    accountIds: Optional[List[str]] = None
    mediaUrls: Optional[List[str]] = None
    status: Optional[str] = None
    scheduledAt: Optional[str] = None

class PostResponse(BaseModel):
    id: str
    userId: str
    content: str
    mediaUrls: List[str]
    accountIds: List[str]
    platforms: List[str]
    status: str
    scheduledAt: Optional[str] = None
    publishedAt: Optional[str] = None
    platformResults: List[dict] = []
    createdAt: str
    updatedAt: str
    accounts: List[dict] = []

# Message Models (Phase 4)
class MessageResponse(BaseModel):
    id: str
    userId: str
    accountId: str
    platform: str
    type: str
    externalId: Optional[str] = None
    senderName: str
    senderHandle: Optional[str] = None
    senderAvatar: Optional[str] = None
    content: str
    postId: Optional[str] = None
    postPreview: Optional[str] = None
    threadId: Optional[str] = None
    isRead: bool
    isReplied: bool
    receivedAt: str
    repliedAt: Optional[str] = None
    replyContent: Optional[str] = None
    account: Optional[dict] = None

class ReplyCreate(BaseModel):
    content: str

# Analytics Models (Phase 5)
class AnalyticsOverview(BaseModel):
    totalFollowers: int
    followersGrowth: int
    followersGrowthPercent: str
    totalReach: int
    avgEngagementRate: float
    totalPosts: int
    topPlatform: Optional[str] = None
    platformSummary: List[dict] = []

# ============ PLATFORM CONFIG ============

PLATFORMS = [
    {"platform": "facebook", "name": "Facebook", "color": "#1877F2", "oauthSupported": True},
    {"platform": "instagram", "name": "Instagram", "color": "#E4405F", "oauthSupported": True},
    {"platform": "twitter", "name": "Twitter / X", "color": "#1DA1F2", "oauthSupported": True},
    {"platform": "linkedin", "name": "LinkedIn", "color": "#0A66C2", "oauthSupported": True},
    {"platform": "tiktok", "name": "TikTok", "color": "#000000", "oauthSupported": True},
    {"platform": "youtube", "name": "YouTube", "color": "#FF0000", "oauthSupported": True},
    {"platform": "pinterest", "name": "Pinterest", "color": "#E60023", "oauthSupported": True},
    {"platform": "snapchat", "name": "Snapchat", "color": "#FFFC00", "oauthSupported": False},
    {"platform": "reddit", "name": "Reddit", "color": "#FF4500", "oauthSupported": True},
    {"platform": "tumblr", "name": "Tumblr", "color": "#36465D", "oauthSupported": True},
    {"platform": "telegram", "name": "Telegram", "color": "#0088CC", "oauthSupported": False},
    {"platform": "whatsapp_business", "name": "WhatsApp Business", "color": "#25D366", "oauthSupported": False},
    {"platform": "discord", "name": "Discord", "color": "#5865F2", "oauthSupported": True},
    {"platform": "twitch", "name": "Twitch", "color": "#9146FF", "oauthSupported": True},
    {"platform": "medium", "name": "Medium", "color": "#000000", "oauthSupported": True},
    {"platform": "quora", "name": "Quora", "color": "#B92B27", "oauthSupported": False},
    {"platform": "vk", "name": "VK", "color": "#4C75A3", "oauthSupported": True},
    {"platform": "weibo", "name": "Weibo", "color": "#E6162D", "oauthSupported": False},
    {"platform": "threads", "name": "Threads", "color": "#000000", "oauthSupported": False},
    {"platform": "mastodon", "name": "Mastodon", "color": "#6364FF", "oauthSupported": True},
    {"platform": "bluesky", "name": "Bluesky", "color": "#0085FF", "oauthSupported": False},
    {"platform": "behance", "name": "Behance", "color": "#1769FF", "oauthSupported": True},
    {"platform": "dribbble", "name": "Dribbble", "color": "#EA4C89", "oauthSupported": True},
    {"platform": "github", "name": "GitHub", "color": "#181717", "oauthSupported": True},
    {"platform": "producthunt", "name": "Product Hunt", "color": "#DA552F", "oauthSupported": True},
]

# ============ HELPER FUNCTIONS ============

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    payload = {"user_id": user_id, "exp": expiration, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = verify_jwt_token(token)
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def format_user_response(user: dict) -> UserResponse:
    return UserResponse(
        id=user["id"], name=user["name"], email=user["email"],
        avatar=user.get("avatar", ""), role=user.get("role", "admin"), createdAt=user["createdAt"]
    )

def encrypt_token(token: str) -> str:
    if not token: return ""
    key = ENCRYPTION_KEY
    return ''.join(chr(ord(c) ^ ord(key[i % len(key)])) for i, c in enumerate(token))

def decrypt_token(encrypted: str) -> str:
    return encrypt_token(encrypted)

# ============ PLATFORM SERVICES ============

async def publish_to_platform(platform: str, access_token: str, account_id: str, content: str, media_urls: List[str]) -> dict:
    """Publish content to a specific platform. Returns {postId, status, error}"""
    logger.info(f"📤 Publishing to {platform}...")
    
    # In production, implement real API calls here
    # For now, simulate successful publishing with mock post IDs
    
    if platform == "facebook":
        # Real: POST https://graph.facebook.com/v18.0/{pageId}/feed
        return {"postId": f"fb_{uuid.uuid4().hex[:12]}", "status": "published"}
    
    elif platform == "twitter":
        # Real: POST https://api.twitter.com/2/tweets
        return {"postId": f"tw_{uuid.uuid4().hex[:12]}", "status": "published"}
    
    elif platform == "linkedin":
        # Real: POST https://api.linkedin.com/v2/ugcPosts
        return {"postId": f"li_{uuid.uuid4().hex[:12]}", "status": "published"}
    
    elif platform == "instagram":
        # Real: POST to Instagram Graph API
        return {"postId": f"ig_{uuid.uuid4().hex[:12]}", "status": "published"}
    
    else:
        # Generic stub for other platforms
        logger.info(f"⚠️ Publishing stub for {platform} - logging post content")
        return {"postId": f"mock_{platform}_{uuid.uuid4().hex[:8]}", "status": "published"}

async def publish_post_to_platforms(post: dict, accounts: List[dict]) -> dict:
    """Publish a post to all selected platforms"""
    platform_results = []
    
    for account in accounts:
        try:
            result = await publish_to_platform(
                account["platform"],
                decrypt_token(account.get("accessToken", "")),
                account["accountId"],
                post["content"],
                post.get("mediaUrls", [])
            )
            platform_results.append({
                "platform": account["platform"],
                "accountId": account["id"],
                "platformPostId": result.get("postId"),
                "status": result.get("status", "published"),
                "error": result.get("error"),
                "publishedAt": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            logger.error(f"❌ Failed to publish to {account['platform']}: {str(e)}")
            platform_results.append({
                "platform": account["platform"],
                "accountId": account["id"],
                "status": "failed",
                "error": str(e)
            })
    
    # Determine overall status
    failed_count = sum(1 for r in platform_results if r["status"] == "failed")
    if failed_count == len(platform_results):
        final_status = "failed"
    elif failed_count > 0:
        final_status = "published"  # partial success
    else:
        final_status = "published"
    
    return {"status": final_status, "platformResults": platform_results}

# ============ INBOX SYNC SERVICES ============

async def fetch_platform_messages(platform: str, access_token: str, account_id: str) -> List[dict]:
    """Fetch messages/comments/mentions from a platform"""
    logger.info(f"📨 Fetching messages from {platform}...")
    
    # In production, implement real API calls
    # For demo, return mock messages
    message_types = ["dm", "comment", "mention", "reply"]
    mock_names = ["Alex Johnson", "Sarah Smith", "Mike Chen", "Emily Davis", "Chris Wilson"]
    mock_contents = [
        "Love your content! Keep it up! 🔥",
        "Great post, very insightful!",
        "Could you share more about this topic?",
        "Amazing work as always!",
        "This is exactly what I needed to see today!",
        "Can you do a follow-up on this?",
        "Shared this with my team!",
        "Your content is always so helpful 🙏"
    ]
    
    # Generate 0-3 random mock messages
    messages = []
    for _ in range(random.randint(0, 3)):
        msg_type = random.choice(message_types)
        name = random.choice(mock_names)
        messages.append({
            "platform": platform,
            "type": msg_type,
            "externalId": f"{platform}_{uuid.uuid4().hex[:12]}",
            "senderName": name,
            "senderHandle": f"@{name.lower().replace(' ', '_')}",
            "senderAvatar": f"https://api.dicebear.com/7.x/avataaars/svg?seed={name}",
            "content": random.choice(mock_contents),
            "postId": f"post_{uuid.uuid4().hex[:8]}" if msg_type in ["comment", "reply"] else None,
            "postPreview": "Your recent post about social media..." if msg_type in ["comment", "reply"] else None,
            "receivedAt": (datetime.now(timezone.utc) - timedelta(minutes=random.randint(5, 1440))).isoformat()
        })
    
    return messages

async def reply_to_platform_message(platform: str, access_token: str, message: dict, reply_content: str) -> dict:
    """Reply to a message on a platform"""
    logger.info(f"💬 Replying on {platform}...")
    # In production, implement real API calls
    return {"success": True, "replyId": f"reply_{uuid.uuid4().hex[:8]}"}

# ============ ANALYTICS SYNC SERVICES ============

async def fetch_platform_analytics(platform: str, access_token: str, account_id: str) -> dict:
    """Fetch analytics from a platform"""
    logger.info(f"📊 Fetching analytics from {platform}...")
    
    # In production, implement real API calls
    # For demo, return mock analytics with realistic ranges
    base_followers = random.randint(1000, 50000)
    return {
        "followers": base_followers,
        "followersGrowth": random.randint(-50, 200),
        "reach": random.randint(base_followers, base_followers * 10),
        "impressions": random.randint(base_followers * 2, base_followers * 15),
        "engagement": random.randint(100, 5000),
        "engagementRate": round(random.uniform(1.0, 8.0), 2),
        "likes": random.randint(50, 3000),
        "comments": random.randint(10, 500),
        "shares": random.randint(5, 300),
        "clicks": random.randint(20, 1000),
        "profileViews": random.randint(100, 2000),
        "postsCount": random.randint(1, 20)
    }

# ============ APP SETUP ============

app = FastAPI(title="SocialHub API")
api_router = APIRouter(prefix="/api")

# ============ AUTH ROUTES ============

@api_router.post("/auth/register", response_model=AuthResponse)
async def register(data: UserCreate):
    logger.info(f"🔐 Registration attempt for {data.email}")
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id, "name": data.name, "email": data.email,
        "password": hash_password(data.password), "avatar": "", "role": "admin",
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user)
    token = create_jwt_token(user_id)
    logger.info(f"✅ User registered: {data.email}")
    return AuthResponse(token=token, user=format_user_response(user))

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(data: UserLogin):
    logger.info(f"🔐 Login attempt for {data.email}")
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_jwt_token(user["id"])
    logger.info(f"✅ User logged in: {data.email}")
    return AuthResponse(token=token, user=format_user_response(user))

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return format_user_response(current_user)

# ============ ACCOUNTS ROUTES ============

@api_router.get("/accounts", response_model=List[SocialAccountResponse])
async def get_accounts(current_user: dict = Depends(get_current_user)):
    accounts = await db.social_accounts.find(
        {"userId": current_user["id"]}, {"_id": 0, "accessToken": 0, "refreshToken": 0}
    ).to_list(100)
    return [SocialAccountResponse(**acc) for acc in accounts]

@api_router.get("/accounts/platforms", response_model=List[PlatformInfo])
async def get_platforms(current_user: dict = Depends(get_current_user)):
    user_accounts = await db.social_accounts.find(
        {"userId": current_user["id"]}, {"_id": 0, "accessToken": 0, "refreshToken": 0}
    ).to_list(100)
    accounts_by_platform = {acc["platform"]: acc for acc in user_accounts}
    
    result = []
    for platform in PLATFORMS:
        info = PlatformInfo(
            platform=platform["platform"], name=platform["name"],
            color=platform["color"], oauthSupported=platform["oauthSupported"],
            connected=platform["platform"] in accounts_by_platform
        )
        if platform["platform"] in accounts_by_platform:
            info.account = SocialAccountResponse(**accounts_by_platform[platform["platform"]])
        result.append(info)
    return result

@api_router.get("/accounts/oauth/{platform}/callback")
async def oauth_callback(platform: str, user_id: str):
    platform_config = next((p for p in PLATFORMS if p["platform"] == platform), None)
    if not platform_config:
        raise HTTPException(status_code=404, detail="Platform not found")
    
    existing = await db.social_accounts.find_one({"userId": user_id, "platform": platform})
    if existing:
        return {"message": "Already connected", "platform": platform}
    
    account_id = str(uuid.uuid4())
    account = {
        "id": account_id, "userId": user_id, "platform": platform,
        "accountName": f"Demo {platform_config['name']} Account",
        "accountId": f"demo_{platform}_{user_id[:8]}",
        "profilePicture": f"https://api.dicebear.com/7.x/initials/svg?seed={platform}",
        "accessToken": encrypt_token(f"demo_access_token_{platform}"),
        "refreshToken": encrypt_token(f"demo_refresh_token_{platform}"),
        "tokenExpiry": (datetime.now(timezone.utc) + timedelta(days=60)).isoformat(),
        "isActive": True, "followers": 1000 + hash(platform) % 9000,
        "connectedAt": datetime.now(timezone.utc).isoformat()
    }
    await db.social_accounts.insert_one(account)
    logger.info(f"🔗 {platform} connected for user {user_id}")
    return {"message": "Connected successfully", "platform": platform}

@api_router.delete("/accounts/{account_id}")
async def disconnect_account(account_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.social_accounts.delete_one({"id": account_id, "userId": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    logger.info(f"🔗 Account {account_id} disconnected")
    return {"message": "Account disconnected successfully"}

# ============ POSTS ROUTES (Updated for Phase 3) ============

@api_router.get("/posts", response_model=List[PostResponse])
async def get_posts(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {"userId": current_user["id"]}
    if status:
        query["status"] = status
    
    posts = await db.posts.find(query, {"_id": 0}).sort("createdAt", -1).to_list(1000)
    
    result = []
    for post in posts:
        accounts = []
        for acc_id in post.get("accountIds", []):
            acc = await db.social_accounts.find_one({"id": acc_id}, {"_id": 0, "accessToken": 0, "refreshToken": 0})
            if acc:
                accounts.append({"id": acc["id"], "accountName": acc["accountName"], 
                               "profilePicture": acc["profilePicture"], "platform": acc["platform"]})
        
        result.append(PostResponse(
            id=post["id"], userId=post["userId"], content=post["content"],
            mediaUrls=post.get("mediaUrls", []), accountIds=post.get("accountIds", []),
            platforms=post.get("platforms", []), status=post.get("status", "draft"),
            scheduledAt=post.get("scheduledAt"), publishedAt=post.get("publishedAt"),
            platformResults=post.get("platformResults", []),
            createdAt=post["createdAt"], updatedAt=post.get("updatedAt", post["createdAt"]),
            accounts=accounts
        ))
    return result

@api_router.get("/posts/{post_id}", response_model=PostResponse)
async def get_post(post_id: str, current_user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id, "userId": current_user["id"]}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    accounts = []
    for acc_id in post.get("accountIds", []):
        acc = await db.social_accounts.find_one({"id": acc_id}, {"_id": 0, "accessToken": 0, "refreshToken": 0})
        if acc:
            accounts.append({"id": acc["id"], "accountName": acc["accountName"],
                           "profilePicture": acc["profilePicture"], "platform": acc["platform"]})
    
    return PostResponse(
        id=post["id"], userId=post["userId"], content=post["content"],
        mediaUrls=post.get("mediaUrls", []), accountIds=post.get("accountIds", []),
        platforms=post.get("platforms", []), status=post.get("status", "draft"),
        scheduledAt=post.get("scheduledAt"), publishedAt=post.get("publishedAt"),
        platformResults=post.get("platformResults", []),
        createdAt=post["createdAt"], updatedAt=post.get("updatedAt", post["createdAt"]),
        accounts=accounts
    )

@api_router.post("/posts", response_model=PostResponse)
async def create_post(data: PostCreate, current_user: dict = Depends(get_current_user)):
    if not data.content or not data.content.strip():
        raise HTTPException(status_code=400, detail="Content is required")
    if not data.accountIds or len(data.accountIds) == 0:
        raise HTTPException(status_code=400, detail="At least one account must be selected")
    
    # Get platforms from account IDs
    platforms = []
    accounts_full = []
    for acc_id in data.accountIds:
        acc = await db.social_accounts.find_one({"id": acc_id}, {"_id": 0})
        if acc:
            platforms.append(acc["platform"])
            accounts_full.append(acc)
    
    post_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Determine status based on scheduledAt
    post_status = data.status
    scheduled_at = data.scheduledAt
    published_at = None
    platform_results = []
    
    if scheduled_at:
        scheduled_dt = datetime.fromisoformat(scheduled_at.replace('Z', '+00:00'))
        if scheduled_dt <= datetime.now(timezone.utc):
            # Publish immediately
            post_status = "publishing"
        else:
            post_status = "scheduled"
    elif data.status == "published":
        # Publish immediately
        post_status = "publishing"
    
    post = {
        "id": post_id, "userId": current_user["id"], "content": data.content,
        "mediaUrls": data.mediaUrls, "accountIds": data.accountIds,
        "platforms": platforms, "status": post_status,
        "scheduledAt": scheduled_at, "publishedAt": published_at,
        "platformResults": platform_results,
        "createdAt": now, "updatedAt": now
    }
    
    await db.posts.insert_one(post)
    
    # If publishing immediately
    if post_status == "publishing":
        result = await publish_post_to_platforms(post, accounts_full)
        await db.posts.update_one(
            {"id": post_id},
            {"$set": {
                "status": result["status"],
                "platformResults": result["platformResults"],
                "publishedAt": datetime.now(timezone.utc).isoformat()
            }}
        )
        post["status"] = result["status"]
        post["platformResults"] = result["platformResults"]
        post["publishedAt"] = datetime.now(timezone.utc).isoformat()
    
    logger.info(f"📝 New post created by {current_user['name']} - Status: {post['status']}")
    
    return PostResponse(
        id=post_id, userId=current_user["id"], content=data.content,
        mediaUrls=data.mediaUrls, accountIds=data.accountIds,
        platforms=platforms, status=post["status"],
        scheduledAt=scheduled_at, publishedAt=post.get("publishedAt"),
        platformResults=post.get("platformResults", []),
        createdAt=now, updatedAt=now, accounts=[]
    )

@api_router.put("/posts/{post_id}", response_model=PostResponse)
async def update_post(post_id: str, data: PostUpdate, current_user: dict = Depends(get_current_user)):
    post = await db.posts.find_one({"id": post_id, "userId": current_user["id"]}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    update_data = {"updatedAt": datetime.now(timezone.utc).isoformat()}
    
    if data.content is not None:
        update_data["content"] = data.content
    if data.accountIds is not None:
        update_data["accountIds"] = data.accountIds
        platforms = []
        for acc_id in data.accountIds:
            acc = await db.social_accounts.find_one({"id": acc_id})
            if acc:
                platforms.append(acc["platform"])
        update_data["platforms"] = platforms
    if data.mediaUrls is not None:
        update_data["mediaUrls"] = data.mediaUrls
    if data.scheduledAt is not None:
        update_data["scheduledAt"] = data.scheduledAt
        if data.scheduledAt:
            scheduled_dt = datetime.fromisoformat(data.scheduledAt.replace('Z', '+00:00'))
            if scheduled_dt > datetime.now(timezone.utc):
                update_data["status"] = "scheduled"
    if data.status is not None:
        update_data["status"] = data.status
    
    await db.posts.update_one({"id": post_id}, {"$set": update_data})
    updated_post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    
    logger.info(f"📝 Post updated by {current_user['name']}")
    
    accounts = []
    for acc_id in updated_post.get("accountIds", []):
        acc = await db.social_accounts.find_one({"id": acc_id}, {"_id": 0, "accessToken": 0, "refreshToken": 0})
        if acc:
            accounts.append({"id": acc["id"], "accountName": acc["accountName"],
                           "profilePicture": acc["profilePicture"], "platform": acc["platform"]})
    
    return PostResponse(
        id=updated_post["id"], userId=updated_post["userId"], content=updated_post["content"],
        mediaUrls=updated_post.get("mediaUrls", []), accountIds=updated_post.get("accountIds", []),
        platforms=updated_post.get("platforms", []), status=updated_post.get("status", "draft"),
        scheduledAt=updated_post.get("scheduledAt"), publishedAt=updated_post.get("publishedAt"),
        platformResults=updated_post.get("platformResults", []),
        createdAt=updated_post["createdAt"], updatedAt=updated_post["updatedAt"],
        accounts=accounts
    )

@api_router.delete("/posts/{post_id}")
async def delete_post(post_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.posts.delete_one({"id": post_id, "userId": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    logger.info(f"📝 Post deleted")
    return {"message": "Post deleted successfully"}

@api_router.post("/posts/{post_id}/publish")
async def publish_post_now(post_id: str, current_user: dict = Depends(get_current_user)):
    """Force publish a post immediately"""
    post = await db.posts.find_one({"id": post_id, "userId": current_user["id"]}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Get accounts
    accounts_full = []
    for acc_id in post.get("accountIds", []):
        acc = await db.social_accounts.find_one({"id": acc_id}, {"_id": 0})
        if acc:
            accounts_full.append(acc)
    
    # Update status to publishing
    await db.posts.update_one({"id": post_id}, {"$set": {"status": "publishing"}})
    
    # Publish
    result = await publish_post_to_platforms(post, accounts_full)
    
    # Update post with results
    await db.posts.update_one(
        {"id": post_id},
        {"$set": {
            "status": result["status"],
            "platformResults": result["platformResults"],
            "publishedAt": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"✅ Post {post_id} force published")
    return {"message": "Post published", "status": result["status"]}

# ============ SCHEDULER ROUTES (Phase 3) ============

@api_router.get("/scheduler/calendar")
async def get_calendar(
    month: int,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Get posts grouped by date for calendar view"""
    start_date = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    posts = await db.posts.find({
        "userId": current_user["id"],
        "$or": [
            {"scheduledAt": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}},
            {"publishedAt": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}}
        ]
    }, {"_id": 0}).to_list(1000)
    
    # Group by date
    calendar_data = {}
    for post in posts:
        date_str = None
        if post.get("scheduledAt"):
            date_str = post["scheduledAt"][:10]
        elif post.get("publishedAt"):
            date_str = post["publishedAt"][:10]
        elif post.get("createdAt"):
            date_str = post["createdAt"][:10]
        
        if date_str:
            if date_str not in calendar_data:
                calendar_data[date_str] = []
            calendar_data[date_str].append({
                "id": post["id"],
                "content": post["content"][:60] + "..." if len(post["content"]) > 60 else post["content"],
                "platforms": post.get("platforms", []),
                "status": post.get("status", "draft"),
                "scheduledAt": post.get("scheduledAt"),
                "publishedAt": post.get("publishedAt")
            })
    
    return calendar_data

# ============ INBOX ROUTES (Phase 4) ============

@api_router.get("/inbox")
async def get_messages(
    platform: Optional[str] = None,
    type: Optional[str] = None,
    isRead: Optional[bool] = None,
    page: int = 1,
    current_user: dict = Depends(get_current_user)
):
    """Get inbox messages with filters"""
    query = {"userId": current_user["id"]}
    if platform:
        query["platform"] = platform
    if type:
        query["type"] = type
    if isRead is not None:
        query["isRead"] = isRead
    
    skip = (page - 1) * 30
    messages = await db.messages.find(query, {"_id": 0}).sort("receivedAt", -1).skip(skip).limit(30).to_list(30)
    total = await db.messages.count_documents(query)
    unread_count = await db.messages.count_documents({"userId": current_user["id"], "isRead": False})
    
    # Enrich with account info
    result = []
    for msg in messages:
        account = await db.social_accounts.find_one({"id": msg.get("accountId")}, {"_id": 0, "accessToken": 0, "refreshToken": 0})
        msg["account"] = account
        result.append(msg)
    
    return {"messages": result, "total": total, "page": page, "unreadCount": unread_count}

@api_router.get("/inbox/unread-count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    """Get unread message counts"""
    total = await db.messages.count_documents({"userId": current_user["id"], "isRead": False})
    
    # Count by platform
    pipeline = [
        {"$match": {"userId": current_user["id"], "isRead": False}},
        {"$group": {"_id": "$platform", "count": {"$sum": 1}}}
    ]
    by_platform_cursor = db.messages.aggregate(pipeline)
    by_platform = {doc["_id"]: doc["count"] async for doc in by_platform_cursor}
    
    return {"total": total, "byPlatform": by_platform}

@api_router.put("/inbox/{message_id}/read")
async def mark_message_read(message_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a message as read"""
    result = await db.messages.update_one(
        {"id": message_id, "userId": current_user["id"]},
        {"$set": {"isRead": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"message": "Marked as read"}

@api_router.put("/inbox/read-all")
async def mark_all_read(
    platform: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Mark all messages as read"""
    query = {"userId": current_user["id"], "isRead": False}
    if platform:
        query["platform"] = platform
    
    result = await db.messages.update_many(query, {"$set": {"isRead": True}})
    return {"message": f"Marked {result.modified_count} messages as read"}

@api_router.post("/inbox/{message_id}/reply")
async def reply_to_message(
    message_id: str,
    data: ReplyCreate,
    current_user: dict = Depends(get_current_user)
):
    """Reply to a message"""
    message = await db.messages.find_one({"id": message_id, "userId": current_user["id"]}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    account = await db.social_accounts.find_one({"id": message["accountId"]}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Send reply via platform API
    try:
        result = await reply_to_platform_message(
            message["platform"],
            decrypt_token(account.get("accessToken", "")),
            message,
            data.content
        )
        
        # Update message
        await db.messages.update_one(
            {"id": message_id},
            {"$set": {
                "isReplied": True,
                "repliedAt": datetime.now(timezone.utc).isoformat(),
                "replyContent": data.content
            }}
        )
        
        logger.info(f"💬 Reply sent on {message['platform']}")
        return {"message": "Reply sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send reply: {str(e)}")

@api_router.post("/inbox/sync")
async def sync_inbox(current_user: dict = Depends(get_current_user)):
    """Manually trigger inbox sync"""
    accounts = await db.social_accounts.find({"userId": current_user["id"], "isActive": True}, {"_id": 0}).to_list(100)
    new_messages = 0
    
    for account in accounts:
        try:
            messages = await fetch_platform_messages(
                account["platform"],
                decrypt_token(account.get("accessToken", "")),
                account["accountId"]
            )
            
            for msg in messages:
                # Check for duplicate
                existing = await db.messages.find_one({
                    "externalId": msg["externalId"],
                    "platform": msg["platform"]
                })
                if not existing:
                    msg["id"] = str(uuid.uuid4())
                    msg["userId"] = current_user["id"]
                    msg["accountId"] = account["id"]
                    msg["isRead"] = False
                    msg["isReplied"] = False
                    await db.messages.insert_one(msg)
                    new_messages += 1
            
            logger.info(f"✅ Synced inbox: {account['platform']}")
        except Exception as e:
            logger.error(f"❌ Inbox sync failed: {account['platform']} - {str(e)}")
    
    return {"synced": len(accounts), "newMessages": new_messages}

# ============ ANALYTICS ROUTES (Phase 5) ============

@api_router.get("/analytics/overview")
async def get_analytics_overview(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get analytics overview across all accounts"""
    if not startDate:
        startDate = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    if not endDate:
        endDate = datetime.now(timezone.utc).isoformat()
    
    accounts = await db.social_accounts.find({"userId": current_user["id"]}, {"_id": 0}).to_list(100)
    
    total_followers = sum(acc.get("followers", 0) for acc in accounts)
    
    # Get analytics data
    analytics = await db.analytics.find({
        "userId": current_user["id"],
        "date": {"$gte": startDate, "$lte": endDate}
    }, {"_id": 0}).to_list(1000)
    
    # Calculate totals
    total_reach = sum(a.get("reach", 0) for a in analytics)
    total_engagement = sum(a.get("engagement", 0) for a in analytics)
    avg_engagement_rate = sum(a.get("engagementRate", 0) for a in analytics) / max(len(analytics), 1)
    followers_growth = sum(a.get("followersGrowth", 0) for a in analytics)
    
    # Get posts count
    posts_count = await db.posts.count_documents({
        "userId": current_user["id"],
        "status": "published"
    })
    
    # Platform summary
    platform_summary = []
    for acc in accounts:
        acc_analytics = [a for a in analytics if a.get("accountId") == acc["id"]]
        avg_rate = sum(a.get("engagementRate", 0) for a in acc_analytics) / max(len(acc_analytics), 1)
        platform_summary.append({
            "platform": acc["platform"],
            "accountName": acc["accountName"],
            "followers": acc.get("followers", 0),
            "engagementRate": round(avg_rate, 2)
        })
    
    # Find top platform
    top_platform = max(platform_summary, key=lambda x: x["followers"])["platform"] if platform_summary else None
    
    growth_percent = f"+{round(followers_growth / max(total_followers - followers_growth, 1) * 100, 1)}%" if followers_growth >= 0 else f"{round(followers_growth / max(total_followers, 1) * 100, 1)}%"
    
    return {
        "totalFollowers": total_followers,
        "followersGrowth": followers_growth,
        "followersGrowthPercent": growth_percent,
        "totalReach": total_reach,
        "avgEngagementRate": round(avg_engagement_rate, 2),
        "totalPosts": posts_count,
        "topPlatform": top_platform,
        "platformSummary": platform_summary
    }

@api_router.get("/analytics/followers")
async def get_followers_chart(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get followers data for line chart"""
    if not startDate:
        startDate = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    if not endDate:
        endDate = datetime.now(timezone.utc).isoformat()
    
    analytics = await db.analytics.find({
        "userId": current_user["id"],
        "date": {"$gte": startDate, "$lte": endDate}
    }, {"_id": 0}).sort("date", 1).to_list(1000)
    
    # Group by platform
    platforms_data = {}
    dates_set = set()
    
    for a in analytics:
        platform = a.get("platform")
        date = a.get("date", "")[:10]
        dates_set.add(date)
        
        if platform not in platforms_data:
            platforms_data[platform] = {}
        platforms_data[platform][date] = a.get("followers", 0)
    
    dates = sorted(list(dates_set))
    
    # Build series
    platform_colors = {p["platform"]: p["color"] for p in PLATFORMS}
    series = []
    for platform, data in platforms_data.items():
        series.append({
            "platform": platform,
            "color": platform_colors.get(platform, "#6366F1"),
            "data": [data.get(d, 0) for d in dates]
        })
    
    return {"dates": dates, "series": series}

@api_router.get("/analytics/engagement")
async def get_engagement_chart(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get engagement data for bar chart"""
    if not startDate:
        startDate = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    if not endDate:
        endDate = datetime.now(timezone.utc).isoformat()
    
    analytics = await db.analytics.find({
        "userId": current_user["id"],
        "date": {"$gte": startDate, "$lte": endDate}
    }, {"_id": 0}).to_list(1000)
    
    # Aggregate by platform
    platform_metrics = {}
    for a in analytics:
        platform = a.get("platform")
        if platform not in platform_metrics:
            platform_metrics[platform] = {"likes": 0, "comments": 0, "shares": 0}
        platform_metrics[platform]["likes"] += a.get("likes", 0)
        platform_metrics[platform]["comments"] += a.get("comments", 0)
        platform_metrics[platform]["shares"] += a.get("shares", 0)
    
    platforms = list(platform_metrics.keys())
    return {
        "platforms": platforms,
        "metrics": {
            "likes": [platform_metrics[p]["likes"] for p in platforms],
            "comments": [platform_metrics[p]["comments"] for p in platforms],
            "shares": [platform_metrics[p]["shares"] for p in platforms]
        }
    }

@api_router.get("/analytics/posts")
async def get_top_posts(
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get top performing posts"""
    if not startDate:
        startDate = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    if not endDate:
        endDate = datetime.now(timezone.utc).isoformat()
    
    posts = await db.posts.find({
        "userId": current_user["id"],
        "status": "published",
        "publishedAt": {"$gte": startDate, "$lte": endDate}
    }, {"_id": 0}).to_list(100)
    
    # Calculate engagement for each post (mock for demo)
    result = []
    for post in posts:
        engagement = random.randint(100, 5000)
        likes = int(engagement * 0.7)
        comments = int(engagement * 0.2)
        shares = int(engagement * 0.1)
        reach = engagement * random.randint(10, 50)
        
        result.append({
            "id": post["id"],
            "content": post["content"][:60] + "..." if len(post["content"]) > 60 else post["content"],
            "platforms": post.get("platforms", []),
            "publishedAt": post.get("publishedAt"),
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "reach": reach,
            "engagementRate": round((likes + comments + shares) / max(reach, 1) * 100, 2)
        })
    
    # Sort by engagement rate
    result.sort(key=lambda x: x["engagementRate"], reverse=True)
    return result[:20]

@api_router.post("/analytics/sync")
async def sync_analytics(current_user: dict = Depends(get_current_user)):
    """Manually trigger analytics sync"""
    accounts = await db.social_accounts.find({"userId": current_user["id"], "isActive": True}, {"_id": 0}).to_list(100)
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    for account in accounts:
        try:
            data = await fetch_platform_analytics(
                account["platform"],
                decrypt_token(account.get("accessToken", "")),
                account["accountId"]
            )
            
            # Upsert today's snapshot
            await db.analytics.update_one(
                {"accountId": account["id"], "date": today},
                {"$set": {
                    "id": str(uuid.uuid4()),
                    "userId": current_user["id"],
                    "accountId": account["id"],
                    "platform": account["platform"],
                    "date": today,
                    **data
                }},
                upsert=True
            )
            
            # Update followers on account
            await db.social_accounts.update_one(
                {"id": account["id"]},
                {"$set": {"followers": data["followers"]}}
            )
            
            logger.info(f"✅ Analytics synced: {account['platform']}")
        except Exception as e:
            logger.error(f"❌ Analytics sync failed: {account['platform']} - {str(e)}")
    
    return {"synced": len(accounts)}

# ============ SCHEDULER SERVICE ============

scheduler = AsyncIOScheduler()

async def auto_publish_scheduled_posts():
    """Check and publish due scheduled posts"""
    logger.info("⏰ Scheduler: checking due posts...")
    now = datetime.now(timezone.utc).isoformat()
    
    posts = await db.posts.find({
        "status": "scheduled",
        "scheduledAt": {"$lte": now}
    }, {"_id": 0}).to_list(100)
    
    for post in posts:
        try:
            # Get accounts
            accounts_full = []
            for acc_id in post.get("accountIds", []):
                acc = await db.social_accounts.find_one({"id": acc_id}, {"_id": 0})
                if acc:
                    accounts_full.append(acc)
            
            # Update status
            await db.posts.update_one({"id": post["id"]}, {"$set": {"status": "publishing"}})
            
            # Publish
            result = await publish_post_to_platforms(post, accounts_full)
            
            # Update with results
            await db.posts.update_one(
                {"id": post["id"]},
                {"$set": {
                    "status": result["status"],
                    "platformResults": result["platformResults"],
                    "publishedAt": datetime.now(timezone.utc).isoformat()
                }}
            )
            logger.info(f"✅ Auto-published post {post['id']}")
        except Exception as e:
            logger.error(f"❌ Failed to auto-publish post {post['id']}: {str(e)}")
            await db.posts.update_one({"id": post["id"]}, {"$set": {"status": "failed"}})

async def auto_sync_inbox():
    """Sync inbox for all users"""
    logger.info("📨 Auto inbox sync running...")
    users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(1000)
    for user in users:
        accounts = await db.social_accounts.find({"userId": user["id"], "isActive": True}, {"_id": 0}).to_list(100)
        for account in accounts:
            try:
                messages = await fetch_platform_messages(account["platform"], "", account["accountId"])
                for msg in messages:
                    existing = await db.messages.find_one({"externalId": msg["externalId"], "platform": msg["platform"]})
                    if not existing:
                        msg["id"] = str(uuid.uuid4())
                        msg["userId"] = user["id"]
                        msg["accountId"] = account["id"]
                        msg["isRead"] = False
                        msg["isReplied"] = False
                        await db.messages.insert_one(msg)
            except Exception as e:
                logger.error(f"❌ Auto inbox sync failed for {account['platform']}: {str(e)}")

async def auto_sync_analytics():
    """Sync analytics for all users daily"""
    logger.info("📊 Daily analytics sync running...")
    users = await db.users.find({}, {"_id": 0, "id": 1}).to_list(1000)
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    for user in users:
        accounts = await db.social_accounts.find({"userId": user["id"], "isActive": True}, {"_id": 0}).to_list(100)
        for account in accounts:
            try:
                data = await fetch_platform_analytics(account["platform"], "", account["accountId"])
                await db.analytics.update_one(
                    {"accountId": account["id"], "date": today},
                    {"$set": {"id": str(uuid.uuid4()), "userId": user["id"], "accountId": account["id"],
                             "platform": account["platform"], "date": today, **data}},
                    upsert=True
                )
                await db.social_accounts.update_one({"id": account["id"]}, {"$set": {"followers": data["followers"]}})
            except Exception as e:
                logger.error(f"❌ Auto analytics sync failed for {account['platform']}: {str(e)}")

# ============ APP CONFIG ============

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    logger.info("🚀 SocialHub API started")
    
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.social_accounts.create_index("id", unique=True)
    await db.social_accounts.create_index([("userId", 1), ("platform", 1)])
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index("userId")
    await db.posts.create_index([("status", 1), ("scheduledAt", 1)])
    await db.messages.create_index("id", unique=True)
    await db.messages.create_index([("userId", 1), ("isRead", 1), ("receivedAt", -1)])
    await db.messages.create_index([("externalId", 1), ("platform", 1)], unique=True, sparse=True)
    await db.analytics.create_index([("accountId", 1), ("date", 1)], unique=True)
    
    # Start scheduler
    scheduler.add_job(auto_publish_scheduled_posts, IntervalTrigger(minutes=1), id="auto_publish")
    scheduler.add_job(auto_sync_inbox, IntervalTrigger(minutes=15), id="auto_inbox_sync")
    scheduler.add_job(auto_sync_analytics, CronTrigger(hour=2, minute=0), id="daily_analytics")
    scheduler.start()
    logger.info("⏰ Scheduler started with 3 cron jobs")

@app.on_event("shutdown")
async def shutdown_db_client():
    scheduler.shutdown()
    client.close()
    logger.info("🚀 SocialHub API stopped")
