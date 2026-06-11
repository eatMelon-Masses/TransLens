# Chrome Web Store Publishing Checklist

## Pre-Submission

### Required Files
- [x] `manifest.json` - With icons, permissions, action configured
- [x] `background.js` - Service worker
- [x] `content.js` - Content script
- [x] `popup.html` + `popup.js` - Extension popup
- [x] `settings.html` + `settings.js` + `settings.css` - Settings page
- [x] `icon48.png` + `icon128.png` - Extension icons
- [x] `privacy.html` - Privacy policy page

### Store Assets (prepare separately)
- [ ] **Promo Tile** (440x280 px) - Optional but recommended
- [ ] **Screenshots** (at least 1, recommend 3-5)
  - Use existing `1.png`, `2.png`, `3.png` from figures/
  - Recommended size: 1280x800 or 640x400
- [ ] **YouTube Video** (optional) - Demo video URL

### Account Setup
- [ ] Chrome Web Store Developer Account ($5 one-time fee)
- [ ] Accepted Developer Distribution Agreement

## Submission Steps

1. **Go to Chrome Web Store Developer Dashboard**
   - https://chrome.google.com/webstore/devconsole

2. **Create New Item**
   - Click "New Item" button
   - Upload `TransLens-2.0.zip`

3. **Fill Store Listing**
   - **Language**: Select primary language
   - **Name**: TransLens
   - **Short Description**: Learn languages while browsing! AI-powered vocabulary annotation with SRS spaced repetition.
   - **Full Description**: Use content from `STORE_LISTING.md`

4. **Upload Assets**
   - Upload screenshots (drag and drop)
   - Upload promo tile if you have one
   - Add YouTube video URL (optional)

5. **Privacy Policy**
   - Host `privacy.html` on a public URL (GitHub Pages, your website)
   - Enter the URL in the Privacy Policy field

6. **Categorization**
   - **Primary Category**: Productivity OR Education
   - **Secondary Category**: Language Learning

7. **Regions & Languages**
   - Select all regions
   - Add any additional languages if applicable

8. **Submit for Review**
   - Click "Publish Changes"
   - Review typically takes 24-72 hours

## Post-Submission

- [ ] Monitor email for review feedback
- [ ] Respond to any policy violations promptly
- [ ] Update extension version for future releases

## Pricing

- [ ] Free (default)
- [ ] Paid (requires merchant account setup)

## Notes

- **First-time submissions**: May take longer for review
- **Updates**: Usually reviewed within 24-48 hours
- **Rejections**: Common reasons include:
  - Unclear functionality description
  - Missing privacy policy URL
  - Misleading screenshots or description

---

**Contact for Support**: [your-email@example.com]
**Developer Website**: [your-website.com]
