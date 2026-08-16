# Prompt untuk Claude Code

Build a cost-tracking and pricing system for a small 3D printing business (UMKM). This is an internal tool, not customer-facing — used by the owner/admin only to track expenses, calculate product cost of goods (HPP), and log sales.

## Tech Stack
- Nuxt 3 (plain JavaScript, no TypeScript)
- PostgreSQL as the database
- Drizzle ORM for schema and queries
- Tailwind CSS for styling (utility-first, clean minimal UI, no component library needed)
- Nuxt server routes (`server/api/`) for backend logic — no separate backend service

## Visual Direction ("3D Factory" theme)
Keep the UI clean and functional first — this is a data-entry/reporting tool used daily, not a marketing site, so avoid heavy decoration that slows down data entry. Apply the factory/workshop feel through a restrained set of choices rather than literal 3D graphics:
- **Color palette**: industrial neutrals as the base (charcoal, slate gray, concrete white) with one accent color evoking filament/machinery — e.g. a safety-orange or hazard-yellow for primary actions and highlights, and a muted teal or blue for secondary states (like PLA spool colors).
- **Typography**: a clean geometric sans-serif for UI text; monospace font for numeric/data fields (costs, quantities, measurements) to reinforce a technical, precision feel and improve scanability in tables.
- **Iconography**: simple line icons for machine, spool, box/packaging, gear — sourced from an icon set already available in the project (e.g. Heroicons via `@heroicons/vue`), not custom illustrations.
- **Structure cues**: subtle dividers/borders like panel seams, card corners with slightly squared (not overly rounded) edges, and a card-based dashboard layout to suggest modular "workstations" — each dashboard card = one station (materials, machines, products, sales).
- **Status colors**: consistent semantic colors for stock levels (low stock = amber/red), product status (rnd = gray, active = green, discontinued = muted), and margin health (healthy = green, thin/negative = red) — this matters more for daily usability than decorative theming.
- Avoid gradients, skeuomorphic textures, or literal factory imagery (no background photos of printers/gears) — the theme should read through color, type, and layout discipline, not illustration.

## Core Domain & Data Model

### 1. Materials (`materials`)
Tracks filament/resin stock and pricing.
- id, name (e.g. "PLA Hitam 1kg"), type (filament/resin), unit (gram/ml), price_per_unit, stock_quantity, supplier, created_at

### 2. Machines (`machines`)
Tracks printer assets and their operating cost.
- id, name, power_watt (for electricity cost calc), purchase_price, purchase_date, depreciation_months (for amortized cost), notes

### 3. Expenses (`expenses`)
General expense log — material purchases, tool purchases, electricity, R&D costs not tied to a specific product yet.
- id, date, category (enum: material, tool, electricity, rnd, other), description, amount, related_product_id (nullable, FK to products), created_at

### 4. Products (`products`)
Master product catalog.
- id, name, description, status (enum: rnd, active, discontinued), created_at

### 5. Product Recipes (`product_recipes`)
Defines what a product consumes to calculate HPP automatically.
- id, product_id (FK), material_id (FK), quantity_used (grams/ml), print_time_minutes, machine_id (FK), failure_rate_percent (default buffer for failed prints), labor_minutes, labor_rate_per_hour

### 6. Packaging (`packaging`)
Tracks packaging materials as a separate stock category from print materials (boxes, bubble wrap, stickers, thank-you cards, etc).
- id, name (e.g. "Box Kecil 10x10", "Bubble Wrap per meter"), unit, price_per_unit, stock_quantity, supplier, created_at

### 7. Product Packaging (`product_packaging`)
Links a product to the packaging items it needs, so packaging cost is included in HPP.
- id, product_id (FK), packaging_id (FK), quantity_used

### 8. Sales (`sales`)
Manual sales log.
- id, date, product_id (FK), quantity, sale_price_per_unit, channel (enum: tokopedia, shopee, tiktok_shop, instagram, whatsapp, direct, other), marketplace_fee_percent (nullable, to account for platform commission when calculating net margin), notes

## Key Features to Build

1. **Dashboard** — overview cards: total expenses this month, total sales this month, top 3 products by margin, low-stock material alerts.

2. **Materials CRUD** — add/edit/delete materials, track stock in/out (deduct manually or via sales, whichever is simpler to implement first — manual deduction is fine for v1).

3. **Expenses CRUD** — log any expense, filter by category and date range, filter by product (to see total R&D cost sunk into a specific product before it goes to market).

4. **Products CRUD + Recipe Builder** — for each product, define its recipe (materials used + quantities, machine + print time, labor time). This is the core feature: from the recipe, auto-calculate **HPP (cost of goods)**:
   ```
   HPP = (material_qty * material_price_per_unit)
       + (print_time_minutes / 60 * machine_hourly_electricity_cost)
       + (machine depreciation per hour * print_time_hours)
       + (labor_minutes / 60 * labor_rate_per_hour)
       + (sum of packaging_qty * packaging_price_per_unit from product_packaging)
       + failure_rate_percent buffer applied on top of material cost
   ```
   Show HPP breakdown clearly in the UI (a simple table showing each cost component, including packaging as its own line item).

5b. **Net margin on sales** — when logging a sale on a marketplace channel, subtract `marketplace_fee_percent` from `sale_price_per_unit` before comparing against HPP, so reports show real net margin rather than gross margin only.

5. **Suggested Selling Price** — given HPP and a target margin % (input field, e.g. 40%), show suggested price = HPP / (1 - margin%). Let user override with round numbers.

6. **Sales Log** — simple form to log a sale (product, qty, price, channel, date). List view with running totals and simple filters (this month, this product, this channel).

7. **Reports page** — simple table/summary: per product, show total units sold, total revenue, total HPP cost, gross margin. Date range filter.

## Non-Functional Requirements
- Single-user app for now — no auth/multi-tenant complexity needed, but structure the code so auth could be added later without a major rewrite.
- All monetary fields stored as integers (smallest unit, no decimals — IDR has no meaningful sub-unit) and displayed with IDR formatting throughout the UI (e.g. "Rp 15.000").
- Mobile-responsive since I might check numbers from my phone.
- Use Drizzle migrations (not `db push`) so schema changes are tracked.
- Seed script with a handful of realistic example materials/products/machines for local testing.

## What to build first (in order)
1. Drizzle schema + migrations for all tables above
2. Materials CRUD
3. Machines CRUD
4. Packaging CRUD
5. Products + Product Recipe builder (materials + packaging) with auto HPP calculation
6. Expenses CRUD
7. Sales log (with net margin calc)
8. Dashboard + Reports page last

Ask me clarifying questions before starting if any part of the schema or calculation logic is ambiguous.
