---
name: Ryukoku Academic Nexus
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#5f3f3b'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#946e69'
  outline-variant: '#e9bcb6'
  surface-tint: '#c0000d'
  primary: '#b7000c'
  on-primary: '#ffffff'
  primary-container: '#e60012'
  on-primary-container: '#fff7f6'
  inverse-primary: '#ffb4aa'
  secondary: '#4e5e84'
  on-secondary: '#ffffff'
  secondary-container: '#c1d1fd'
  on-secondary-container: '#49597f'
  tertiary: '#595a5a'
  on-tertiary: '#ffffff'
  tertiary-container: '#727272'
  on-tertiary-container: '#faf8f8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#930007'
  secondary-fixed: '#d9e2ff'
  secondary-fixed-dim: '#b6c6f2'
  on-secondary-fixed: '#071a3d'
  on-secondary-fixed-variant: '#36466b'
  tertiary-fixed: '#e4e2e2'
  tertiary-fixed-dim: '#c7c6c6'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#464747'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
  ryukoku-red: '#E60012'
  academic-navy: '#1A2B4E'
  surface-gray: '#F8F9FA'
  border-subtle: '#D1D5DB'
  status-required: '#E60012'
  status-elective: '#1A2B4E'
typography:
  display-lg:
    fontFamily: notoSans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: notoSans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: notoSans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: notoSans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: notoSans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-lg:
    fontFamily: notoSans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-md:
    fontFamily: notoSans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  headline-lg-mobile:
    fontFamily: notoSans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-max: 1280px
  gutter: 20px
---

## Brand & Style

The design system establishes a bridge between Ryukoku University’s historic prestige and a modern, student-centric digital experience. It is designed to be **Trustworthy, Academic, and Efficient**, catering to students and faculty who require high-density information presented with clarity.

The visual style is **Corporate Modern**, characterized by a balanced layout, a structured hierarchy, and a professional aesthetic. It avoids unnecessary ornamentation to focus on utility and accessibility. By utilizing the university's signature Deep Red alongside a stabilizing Navy, the system evokes a sense of institutional authority while feeling fresh and responsive. The interface prioritizes readability and ease of navigation to reduce the cognitive load associated with complex course registration tasks.

## Colors

The palette is rooted in the university's heritage. **Ryukoku Red** (#E60012) is the primary brand anchor, used strategically for primary actions, branding elements, and critical "Required" status indicators. **Academic Navy** (#1A2B4E) provides a professional contrast, used for secondary actions, typography, and "Elective" status indicators.

The background system utilizes a "Triple-White" approach: 
- Pure **White** (#FFFFFF) for primary content cards and input fields.
- **Surface Gray** (#F8F9FA) for the main application background to reduce glare.
- **Neutral Gray** (#F0F0F0) for secondary surfaces like sidebars and headers.

Text colors are strictly managed: #1A2B4E for headings to maintain a sophisticated tone, and #333333 for body text to ensure maximum legibility against light backgrounds.

## Typography

This design system uses **Noto Sans** (specifically the JP variant for multi-language support) to ensure a clean, neutral, and highly readable experience across all platforms. 

The scale is designed for **Dense Information Architecture**. Display and Headline styles use a bold weight in Academic Navy to anchor sections. Body text is optimized for the 14px–16px range, providing enough breathing room for long course descriptions while remaining compact enough for large tables. Label styles use increased letter spacing and all-caps (where appropriate) to differentiate metadata like course codes or credits from standard body text.

## Layout & Spacing

The layout follows a **Structured Fluid Grid** model. Content is housed within a 12-column grid for desktop with a maximum width of 1280px. 

- **Desktop (1024px+):** 12 columns, 24px margins, 20px gutters.
- **Tablet (768px - 1023px):** 8 columns, 20px margins, 16px gutters.
- **Mobile (0px - 767px):** 4 columns, 16px margins, 12px gutters.

Spacing follows a 4px base unit. Internal card padding is generally set to `md` (16px), while major section gaps utilize `xl` (32px) to create clear visual separation between the course search interface and the resulting data tables.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layers and Low-Contrast Outlines** rather than heavy shadows. This maintains an academic, "flat-modern" feel.

- **Level 0 (Background):** #F8F9FA.
- **Level 1 (Cards/Tables):** #FFFFFF with a 1px border (#D1D5DB). No shadow.
- **Level 2 (Hover/Active states):** A very soft, diffused shadow (0px 4px 12px rgba(0,0,0,0.05)) is applied only to interactive elements like course cards upon hover.
- **Level 3 (Modals/Popovers):** Solid white surface with a medium shadow and a semi-transparent Navy backdrop blur to maintain focus on the registration confirmation or course details.

## Shapes

The shape language uses **Soft (0.25rem)** roundedness to appear modern and approachable while maintaining a professional, geometric structure.

- **Standard Elements:** (Buttons, Input Fields, Checkboxes) use `rounded` (4px).
- **Large Containers:** (Course Cards, Time-table blocks) use `rounded-lg` (8px).
- **Badges/Status Indicators:** (Required/Elective tags) use `rounded-xl` (12px) to create a distinct visual pill shape that contrasts with the squareness of the grid.

## Components

### Buttons
Primary buttons use a solid Ryukoku Red background with white text. Secondary buttons use an Academic Navy outline with a white background. All buttons have a subtle 200ms transition on hover, shifting the background color slightly darker.

### Course Cards & Time-table
Course cards feature a left-aligned vertical "accent bar" in either Red (Required) or Navy (Elective). The time-table grid uses a fixed-height row system (60px per period) with 1px borders, where registered courses appear as light tinted blocks (e.g., 5% opacity of the category color).

### Status Badges
Badges are small, high-contrast indicators. "Required" uses White text on Ryukoku Red. "Elective" uses White text on Academic Navy. "Full/Closed" uses White text on Tertiary Gray.

### Search Interface
The search bar is prominent, featuring a 2px Academic Navy bottom-border when focused. Filter chips below the search bar allow students to quickly toggle between "Faculty," "Semester," and "Day of Week."

### Data Tables
Tables are designed for high density. Rows alternate with #F8F9FA for readability (zebra-striping). Column headers use Academic Navy with `label-lg` typography for clear categorization.

### Input Fields
Fields use a 1px border (#D1D5DB). On focus, the border transitions to 2px Ryukoku Red to provide clear affordance. Error states use a bright orange-red distinct from the brand red to ensure accessibility.