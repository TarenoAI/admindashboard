---
ARTICLE_ID: 001_BIO_LINK_OPTIMIZATION
AGENT_LANE: AGENT3_WRITER_Step_By_Step
STATUS: PENDING_REVIEW
WORD_COUNT: 515
---

# Section 5: Step-by-Step - Build Your SEO Bio Link Page

## Your Bio Link Audit Checklist

**Current State Analysis:**
- [ ] What is my current bio link URL?
- [ ] Where does it send traffic?
- [ ] Is the destination mobile-optimized?
- [ ] Can I track which posts drive clicks?
- [ ] Does the destination match source content context?
- [ ] Is the page branded or generic?
- [ ] What is current load time? (Test on mobile)

**Gap Identification:**
- [ ] Multiple destinations competing for one link spot
- [ ] No UTM parameters = attribution blindness
- [ ] Generic landing page not matching content context
- [ ] No SEO value (unindexable or no markup)
- [ ] Slow mobile load times
- [ ] Not thumb-friendly touch targets

## Step 1: Design for Mobile Thumb Zones

**Primary CTA Placement:**
Position your most important action in the natural thumb zone (bottom-center of screen for right-handed users, adjust for left).

**Touch Target Sizing:**
Minimum recommended touch target size for comfortable use. Anything smaller causes mis-taps and user frustration.

**Visual Hierarchy:**
Use size, color, and spacing to create clear priority:
- Primary link: Full width, high contrast
- Secondary links: Slightly smaller, grouped logically
- Tertiary options: Collapsed or below fold

**Thumb-Friendly Navigation:**
- Bottom-heavy navigation (not top menus)
- Swipeable content where applicable
- No horizontal scrolling required
- One-tap actions (not multi-step discoveries)

## Step 2: Implement UTM Tracking Strategy

**UTM Structure:**
```
Source: utm_source=instagram|tiktok|linkedin|twitter
Medium: utm_medium=social|bio|organic
Campaign: utm_campaign=[content_series]|[date]
Content: utm_content=[specific_link_label]
```

**Example URL:**
`yoursite.com/product?utm_source=instagram&utm_medium=bio&utm_campaign=productivity_hacks&utm_content=main_cta`

**Tracking Templates:**
Create consistent templates for recurring content:
- Weekly newsletter: utm_campaign=weekly_[date]
- Product launches: utm_campaign=launch_[product_name]
- Evergreen content: utm_campaign=evergreen_[topic]

**Analytics Setup:**
Configure Google Analytics 4 or similar to capture UTM parameters and track:
- Sessions by bio link source
- Conversion rates by platform
- Revenue attribution by content piece

## Step 3: Add Schema Markup and Meta Tags

**Schema Types:**
- **Organization Schema:** Brand name, logo, social profiles
- **Person Schema:** Creator/author information
- **WebSite Schema:** Search action, site name
- **ItemList Schema:** If showing multiple destinations

**Meta Tags:**
- Title: "[Name] - [Primary Value Proposition] | Bio"
- Description: Clear one-sentence summary of what users find
- Open Graph: Image, title, description for social sharing
- Twitter Cards: Similar OG implementation

**Implementation:**
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Your Name",
  "url": "https://yourbiodomain.com",
  "sameAs": [
    "https://instagram.com/yourhandle",
    "https://twitter.com/yourhandle"
  ]
}
</script>
```

## Step 4: Test Across Devices and Platforms

**Device Testing:**
- iPhone (various sizes): Safari, Chrome
- Android (various sizes): Chrome, Samsung Internet
- Tablet: iPad, Android tablets
- Desktop: Chrome, Safari, Firefox (fallback experience)

**Platform Testing:**
- Instagram in-app browser
- TikTok in-app browser
- Twitter/X in-app browser
- LinkedIn in-app browser
- Chrome mobile (direct)
- Safari mobile (direct)

**Performance Testing:**
- Google PageSpeed Insights (mobile score target: 90+)
- GTmetrix mobile test
- WebPageTest.org (3G connection simulation)
- Real device testing on slower connections

**Accessibility Testing:**
- Screen reader compatibility (VoiceOver, TalkBack)
- Color contrast ratios
- Keyboard navigation
-
