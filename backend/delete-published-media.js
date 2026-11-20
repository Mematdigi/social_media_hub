require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Post = require('./models/Post');
const { getLocalMediaFiles } = require('./services/mediaCleanupService');

const DELETE = process.argv.includes('--delete');
const UPLOADS = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, 'uploads'));
const gb = (b) => (b / 1024 ** 3).toFixed(2) + ' GB';

(async () => {
  await mongoose.connect(`${process.env.MONGO_URI || 'mongodb://localhost:27017'}/${process.env.DB_NAME || 'SM_Tool'}`);
  const posts = await Post.find({ mediaDeleted: { $ne: true } }).select('id status mediaUrls youtubeThumbnail').lean();
  const keep = new Set();
  posts.filter(p => p.status !== 'published').forEach(p => getLocalMediaFiles(p).forEach(f => keep.add(f)));
  let files = 0, bytes = 0, cleaned = 0, kept = 0;
  for (const post of posts.filter(p => p.status === 'published')) {
    const list = getLocalMediaFiles(post);
    if (!list.length) continue;
    let allDone = true;
    for (const file of list) {
      if (keep.has(file)) { kept++; allDone = false; continue; }
      const full = path.join(UPLOADS, file);
      if (!full.startsWith(UPLOADS + path.sep) || !fs.existsSync(full)) continue;
      const size = fs.statSync(full).size;
      if (DELETE) fs.unlinkSync(full);
      files++; bytes += size;
      console.log(`${DELETE ? 'Deleted' : 'Would delete'}  ${(size / 1024 ** 2).toFixed(0).padStart(5)} MB  ${file}`);
    }
    if (DELETE && allDone) { await Post.updateOne({ id: post.id }, { $set: { mediaDeleted: true, mediaDeletedAt: new Date() } }); cleaned++; }
  }
  console.log(`\n${DELETE ? 'DELETED' : 'PREVIEW'}: ${files} file(s), ${gb(bytes)} from published posts.` + (DELETE ? ` ${cleaned} post(s) marked as media deleted.` : ' Nothing was deleted. Run again with --delete.'));
  if (kept) console.log(`${kept} file(s) kept because a scheduled/draft/failed post also uses them.`);
  await mongoose.disconnect();
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
