const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: 'dctaixj2i',
  api_key: '153997762186651',
  api_secret: process.env.CLOUDINARY_SECRET
});

// All blog images organized by post
const images = {
  // ── OUR STORY ──
  'our-story/vision': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/691929d9-e2e1-4dba-a8fb-c96e9e53e74a/untitled-design.zip-2-1.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/4fd1621e-9f2d-4115-9cac-78205ac76599/img_0613-1.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/9312fd6a-16d7-44fd-a51b-971be8e03250/img_9538-1.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/23471813-05ae-4c52-844e-8a06bf3a5599/img_3189-1.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/2d7ac6e9-6d40-43ef-8dec-a7579fb3a497/IMG_3195+%281%29.jpeg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/550c0057-ac64-4f19-a2c9-e5649fca4cc1/img_3193-1.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/09634424-26cb-4e05-8ee1-95e31cff97e5/6920618581183686760-1.jpg',
  ],
  'our-story/jackalope': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764218902300-XV8A0D7RTSGWB2MZREBQ/image.png',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764218717032-AYDW0QV8TQYD3BC20I5C/prototype13-3.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/d542af27-5c6b-4391-a7cc-5ce36e09bf95/img_3189-1.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/4fd1621e-9f2d-4115-9cac-78205ac76599/img_0613-1.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764219125788-RAPM71D08KKL93UHXY0M/prototype20-Steel-Frame-Design19.jpg',
  ],
  'our-story/engine-restoration': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/8d4ac5f2-f40b-40cb-995d-a8d00fa0603e/PXL_20250903_013600695.MP.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215123216-EIFHMS8LFHXDDHXO7IH2/PXL_20250828_214605993.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215123529-SRARSIGPIMF2MILTEDR9/PXL_20250828_214621078.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215199873-USJWST0BXFSVHDXEJ0YU/DSC08488.JPG',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215133632-9YFDE280BPZJZFIH47QB/PXL_20250828_214525986.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215210521-FS7G3T9VP0YHE3E58LDD/DSC08466.JPG',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215239361-WCW8062DCE3X5NVTI34G/DSC08473.JPG',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215266936-BC4PT3WKKKGZ11PUG6HO/PXL_20250907_173751051.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215260717-6P0JFQULTHPQB2W3E502/PXL_20250907_173802260.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215280539-HZIUN93Z9Q0D9XP7024P/PXL_20250917_224035591.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215280373-6H2SCOU7VW5U4US0Z2H7/PXL_20250919_014756627.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764215290195-RL37NBGNKBW7AYM8O6Y2/PXL_20250919_014840122.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/8ef26dc7-55ce-4998-b484-d79ad7228cb5/engine+stopmotion1.gif',
  ],
  'our-story/design': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764219147394-21WYD711BOGUWE6L27R0/prototype20-Steel-Frame-Design12.jpg',
  ],
  'our-story/materials-testing': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764219978951-KXYETSRM8L21DX45XYKM/materials00183450.jpg',
  ],
  'our-story/metal-fabrication': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764220527771-X351QA1U6KSPU0Y1J2JR/PXL_20251112_201817014.MP.jpg',
  ],
  'our-story/exo-skeleton': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1771913727034-VG88B53P1JGRBQ7KCOYC/2025-12-20+17.29.35.jpg',
  ],

  // ── ADVENTURES ──
  'adventures/blimpfest-2025': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/550c0057-ac64-4f19-a2c9-e5649fca4cc1/img_3193-1.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/3e8d536d-0bed-48c0-b6d6-fe27113b9bc6/img_0192-1+%281%29.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/23ddddde-f55d-4dff-a9e3-21ca4933d814/1577203330263982427-1.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/09634424-26cb-4e05-8ee1-95e31cff97e5/6920618581183686760-1.jpg',
  ],
  'adventures/marshall-mountain': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1769466817493-0F0DYEKECHII27EQY216/Marshall+Mountain+Final+Poster.jpg',
  ],
  'adventures/bridger-bowl': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1769472266636-912IMVEZPAAA53NRLQFW/Bridger+Bowl+Final+Poster.jpg',
  ],
  'adventures/um-railjam-2026': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1771905537433-58C05SUW3Y3FPGJ96HID/UM+rail+jam+poster.jpg',
  ],

  // ── LISTING PAGE THUMBNAILS ──
  'thumbnails': [
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764223524359-6TFRDWI3KDUL6BUKK2F5/img_0613-1.webp',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764218719161-LTB51N52RZPCXB5NC1N0/prototype13-10.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764217353169-LLLIZ7JPQBYS1XPGWZIZ/DSC08486.JPG',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764219978951-KXYETSRM8L21DX45XYKM/materials00183450.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1764219147394-21WYD711BOGUWE6L27R0/prototype20-Steel-Frame-Design12.jpg',
    'https://images.squarespace-cdn.com/content/v1/683354485449b53bed21618e/1771913727034-VG88B53P1JGRBQ7KCOYC/2025-12-20+17.29.35.jpg',
  ],
};

// Extract a clean filename from a Squarespace URL
function getFilename(url) {
  const decoded = decodeURIComponent(url);
  const parts = decoded.split('/');
  let filename = parts[parts.length - 1];
  // Remove query params
  filename = filename.split('?')[0];
  // Clean up special chars
  filename = filename.replace(/[+\s()]/g, '_').replace(/__+/g, '_');
  return filename;
}

// Track already-uploaded URLs to avoid duplicates
const uploaded = {};
const results = {};

async function uploadImage(url, folder) {
  // Skip duplicates
  if (uploaded[url]) {
    console.log(`  SKIP (duplicate): ${getFilename(url)}`);
    return uploaded[url];
  }

  const filename = getFilename(url);
  const publicId = `disco-carrot/${folder}/${filename.replace(/\.[^.]+$/, '')}`;

  try {
    const result = await cloudinary.uploader.upload(url, {
      public_id: publicId,
      overwrite: false,
      resource_type: 'auto'
    });
    console.log(`  OK: ${filename} -> ${result.secure_url}`);
    uploaded[url] = result.secure_url;
    return result.secure_url;
  } catch (err) {
    console.error(`  FAIL: ${filename} - ${err.message}`);
    uploaded[url] = url; // Keep original URL as fallback
    return url;
  }
}

async function main() {
  console.log('Starting Squarespace -> Cloudinary migration...\n');

  for (const [folder, urls] of Object.entries(images)) {
    console.log(`\n[${folder}] - ${urls.length} images`);
    results[folder] = {};

    for (const url of urls) {
      const newUrl = await uploadImage(url, folder);
      results[folder][url] = newUrl;
    }
  }

  // Write the URL mapping to a JSON file
  const fs = require('fs');
  fs.writeFileSync('image-mapping.json', JSON.stringify(results, null, 2));
  console.log('\n\nDone! URL mapping saved to image-mapping.json');
  console.log(`Total images processed: ${Object.keys(uploaded).length}`);
}

main().catch(console.error);
