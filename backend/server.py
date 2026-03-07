from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
from bson import ObjectId

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
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
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

class SocialAccountCreate(BaseModel):
    platform: str
    accountName: str = ""
    accountId: str = ""
    profilePicture: str = ""
    accessToken: str = ""
    refreshToken: str = ""
    tokenExpiry: Optional[str] = None
    followers: int = 0

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

class PostCreate(BaseModel):
    content: str
    accountIds: List[str]
    mediaUrls: List[str] = []
    status: str = "draft"

class PostUpdate(BaseModel):
    content: Optional[str] = None
    accountIds: Optional[List[str]] = None
    mediaUrls: Optional[List[str]] = None
    status: Optional[str] = None

class PostResponse(BaseModel):
    id: str
    userId: str
    content: str
    mediaUrls: List[str]
    accountIds: List[str]
    platforms: List[str]
    status: str
    createdAt: str
    updatedAt: str
    accounts: List[dict] = []

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
    payload = {
        "user_id": user_id,
        "exp": expiration,
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_jwt_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
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
        id=user["id"],
        name=user["name"],
        email=user["email"],
        avatar=user.get("avatar", ""),
        role=user.get("role", "admin"),
        createdAt=user["createdAt"]
    )

# Simple token encryption (for demo - use proper encryption in production)
def encrypt_token(token: str) -> str:
    if not token:
        return ""
    # Simple XOR-based encryption for demo
    key = ENCRYPTION_KEY
    encrypted = []
    for i, char in enumerate(token):
        encrypted.append(chr(ord(char) ^ ord(key[i % len(key)])))
    return ''.join(encrypted)

def decrypt_token(encrypted: str) -> str:
    return encrypt_token(encrypted)  # XOR is symmetric

# ============ APP SETUP ============

app = FastAPI(title="SocialHub API")
api_router = APIRouter(prefix="/api")

# ============ AUTH ROUTES ============

@api_router.post("/auth/register", response_model=AuthResponse)
async def register(data: UserCreate):
    logger.info(f"🔐 Registration attempt for {data.email}")
    
    # Check if email exists
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "name": data.name,
        "email": data.email,
        "password": hash_password(data.password),
        "avatar": "",
        "role": "admin",
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user)
    token = create_jwt_token(user_id)
    
    logger.info(f"✅ User registered: {data.email}")
    
    return AuthResponse(
        token=token,
        user=format_user_response(user)
    )

@api_router.post("/auth/login", response_model=AuthResponse)
async def login(data: UserLogin):
    logger.info(f"🔐 Login attempt for {data.email}")
    
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_jwt_token(user["id"])
    
    logger.info(f"✅ User logged in: {data.email}")
    
    return AuthResponse(
        token=token,
        user=format_user_response(user)
    )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return format_user_response(current_user)

# ============ ACCOUNTS ROUTES ============

@api_router.get("/accounts", response_model=List[SocialAccountResponse])
async def get_accounts(current_user: dict = Depends(get_current_user)):
    accounts = await db.social_accounts.find(
        {"userId": current_user["id"]},
        {"_id": 0, "accessToken": 0, "refreshToken": 0}
    ).to_list(100)
    
    return [SocialAccountResponse(**acc) for acc in accounts]

@api_router.get("/accounts/platforms", response_model=List[PlatformInfo])
async def get_platforms(current_user: dict = Depends(get_current_user)):
    user_accounts = await db.social_accounts.find(
        {"userId": current_user["id"]},
        {"_id": 0, "accessToken": 0, "refreshToken": 0}
    ).to_list(100)
    
    accounts_by_platform = {acc["platform"]: acc for acc in user_accounts}
    
    result = []
    for platform in PLATFORMS:
        info = PlatformInfo(
            platform=platform["platform"],
            name=platform["name"],
            color=platform["color"],
            oauthSupported=platform["oauthSupported"],
            connected=platform["platform"] in accounts_by_platform
        )
        if platform["platform"] in accounts_by_platform:
            acc = accounts_by_platform[platform["platform"]]
            info.account = SocialAccountResponse(**acc)
        result.append(info)
    
    return result

@api_router.get("/accounts/oauth/{platform}")
async def initiate_oauth(platform: str, current_user: dict = Depends(get_current_user)):
    # Find platform config
    platform_config = next((p for p in PLATFORMS if p["platform"] == platform), None)
    if not platform_config:
        raise HTTPException(status_code=404, detail="Platform not found")
    
    if not platform_config["oauthSupported"]:
        raise HTTPException(status_code=400, detail="OAuth not supported for this platform")
    
    logger.info(f"🔗 OAuth initiated for {platform} by {current_user['email']}")
    
    # In production, redirect to actual OAuth provider
    # For demo, we'll simulate a successful connection
    return {
        "message": f"OAuth flow would start for {platform}",
        "redirect_url": f"/api/accounts/oauth/{platform}/callback?user_id={current_user['id']}"
    }

@api_router.get("/accounts/oauth/{platform}/callback")
async def oauth_callback(platform: str, user_id: str):
    # Simulate OAuth callback - in production this handles the actual OAuth response
    platform_config = next((p for p in PLATFORMS if p["platform"] == platform), None)
    if not platform_config:
        raise HTTPException(status_code=404, detail="Platform not found")
    
    # Check if already connected
    existing = await db.social_accounts.find_one({
        "userId": user_id,
        "platform": platform
    })
    
    if existing:
        return {"message": "Already connected", "platform": platform}
    
    # Create mock account connection
    account_id = str(uuid.uuid4())
    account = {
        "id": account_id,
        "userId": user_id,
        "platform": platform,
        "accountName": f"Demo {platform_config['name']} Account",
        "accountId": f"demo_{platform}_{user_id[:8]}",
        "profilePicture": f"https://api.dicebear.com/7.x/initials/svg?seed={platform}",
        "accessToken": encrypt_token(f"demo_access_token_{platform}"),
        "refreshToken": encrypt_token(f"demo_refresh_token_{platform}"),
        "tokenExpiry": (datetime.now(timezone.utc) + timedelta(days=60)).isoformat(),
        "isActive": True,
        "followers": 1000 + hash(platform) % 9000,
        "connectedAt": datetime.now(timezone.utc).isoformat()
    }
    
    await db.social_accounts.insert_one(account)
    
    logger.info(f"🔗 {platform} connected for user {user_id}")
    
    return {"message": "Connected successfully", "platform": platform}

@api_router.delete("/accounts/{account_id}")
async def disconnect_account(account_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.social_accounts.delete_one({
        "id": account_id,
        "userId": current_user["id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
    
    logger.info(f"🔗 Account {account_id} disconnected by {current_user['email']}")
    
    return {"message": "Account disconnected successfully"}

# ============ POSTS ROUTES ============

@api_router.get("/posts", response_model=List[PostResponse])
async def get_posts(current_user: dict = Depends(get_current_user)):
    posts = await db.posts.find(
        {"userId": current_user["id"]},
        {"_id": 0}
    ).sort("createdAt", -1).to_list(1000)
    
    # Populate account info for each post
    result = []
    for post in posts:
        accounts = []
        for acc_id in post.get("accountIds", []):
            acc = await db.social_accounts.find_one(
                {"id": acc_id},
                {"_id": 0, "accessToken": 0, "refreshToken": 0}
            )
            if acc:
                accounts.append({
                    "id": acc["id"],
                    "accountName": acc["accountName"],
                    "profilePicture": acc["profilePicture"],
                    "platform": acc["platform"]
                })
        
        result.append(PostResponse(
            id=post["id"],
            userId=post["userId"],
            content=post["content"],
            mediaUrls=post.get("mediaUrls", []),
            accountIds=post.get("accountIds", []),
            platforms=post.get("platforms", []),
            status=post.get("status", "draft"),
            createdAt=post["createdAt"],
            updatedAt=post.get("updatedAt", post["createdAt"]),
            accounts=accounts
        ))
    
    return result

@api_router.get("/posts/{post_id}", response_model=PostResponse)
async def get_post(post_id: str, current_user: dict = Depends(get_current_user)):
    post = await db.posts.find_one(
        {"id": post_id, "userId": current_user["id"]},
        {"_id": 0}
    )
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Populate accounts
    accounts = []
    for acc_id in post.get("accountIds", []):
        acc = await db.social_accounts.find_one(
            {"id": acc_id},
            {"_id": 0, "accessToken": 0, "refreshToken": 0}
        )
        if acc:
            accounts.append({
                "id": acc["id"],
                "accountName": acc["accountName"],
                "profilePicture": acc["profilePicture"],
                "platform": acc["platform"]
            })
    
    return PostResponse(
        id=post["id"],
        userId=post["userId"],
        content=post["content"],
        mediaUrls=post.get("mediaUrls", []),
        accountIds=post.get("accountIds", []),
        platforms=post.get("platforms", []),
        status=post.get("status", "draft"),
        createdAt=post["createdAt"],
        updatedAt=post.get("updatedAt", post["createdAt"]),
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
    for acc_id in data.accountIds:
        acc = await db.social_accounts.find_one({"id": acc_id})
        if acc:
            platforms.append(acc["platform"])
    
    post_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    post = {
        "id": post_id,
        "userId": current_user["id"],
        "content": data.content,
        "mediaUrls": data.mediaUrls,
        "accountIds": data.accountIds,
        "platforms": platforms,
        "status": data.status,
        "createdAt": now,
        "updatedAt": now
    }
    
    await db.posts.insert_one(post)
    
    logger.info(f"📝 New post created by {current_user['name']}")
    
    # Get accounts for response
    accounts = []
    for acc_id in data.accountIds:
        acc = await db.social_accounts.find_one(
            {"id": acc_id},
            {"_id": 0, "accessToken": 0, "refreshToken": 0}
        )
        if acc:
            accounts.append({
                "id": acc["id"],
                "accountName": acc["accountName"],
                "profilePicture": acc["profilePicture"],
                "platform": acc["platform"]
            })
    
    return PostResponse(
        id=post_id,
        userId=current_user["id"],
        content=data.content,
        mediaUrls=data.mediaUrls,
        accountIds=data.accountIds,
        platforms=platforms,
        status=data.status,
        createdAt=now,
        updatedAt=now,
        accounts=accounts
    )

@api_router.put("/posts/{post_id}", response_model=PostResponse)
async def update_post(post_id: str, data: PostUpdate, current_user: dict = Depends(get_current_user)):
    post = await db.posts.find_one(
        {"id": post_id, "userId": current_user["id"]},
        {"_id": 0}
    )
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    update_data = {"updatedAt": datetime.now(timezone.utc).isoformat()}
    
    if data.content is not None:
        update_data["content"] = data.content
    
    if data.accountIds is not None:
        update_data["accountIds"] = data.accountIds
        # Re-derive platforms
        platforms = []
        for acc_id in data.accountIds:
            acc = await db.social_accounts.find_one({"id": acc_id})
            if acc:
                platforms.append(acc["platform"])
        update_data["platforms"] = platforms
    
    if data.mediaUrls is not None:
        update_data["mediaUrls"] = data.mediaUrls
    
    if data.status is not None:
        update_data["status"] = data.status
    
    await db.posts.update_one(
        {"id": post_id},
        {"$set": update_data}
    )
    
    # Get updated post
    updated_post = await db.posts.find_one({"id": post_id}, {"_id": 0})
    
    logger.info(f"📝 Post updated by {current_user['name']}")
    
    # Get accounts
    accounts = []
    for acc_id in updated_post.get("accountIds", []):
        acc = await db.social_accounts.find_one(
            {"id": acc_id},
            {"_id": 0, "accessToken": 0, "refreshToken": 0}
        )
        if acc:
            accounts.append({
                "id": acc["id"],
                "accountName": acc["accountName"],
                "profilePicture": acc["profilePicture"],
                "platform": acc["platform"]
            })
    
    return PostResponse(
        id=updated_post["id"],
        userId=updated_post["userId"],
        content=updated_post["content"],
        mediaUrls=updated_post.get("mediaUrls", []),
        accountIds=updated_post.get("accountIds", []),
        platforms=updated_post.get("platforms", []),
        status=updated_post.get("status", "draft"),
        createdAt=updated_post["createdAt"],
        updatedAt=updated_post["updatedAt"],
        accounts=accounts
    )

@api_router.delete("/posts/{post_id}")
async def delete_post(post_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.posts.delete_one({
        "id": post_id,
        "userId": current_user["id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Post not found")
    
    logger.info(f"📝 Post deleted")
    
    return {"message": "Post deleted successfully"}

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("🚀 SocialHub API stopped")
