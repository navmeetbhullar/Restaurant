# Restaurant Stock App — Plan

Sep 29, 2026 · @Navmeet Bhullar

## What the app does

A stock tracker for the restaurant: know what's there, what's missing, what to buy, and whether the order arrived fully.

## Who uses it

- **Admin**: sets up the item list, day groups, and invoices.
- **Checker**: does the stock check and enters what is in the store.

## The 5 parts to build

We build these in order. Tick each one off when it works.

- [ ] **1. Item list (Admin).** Add every item with its unit (kg, litres, pieces, packets) and its normal ideal amount.
- [ ] **2. Day groups (Admin).** A "Normal" group uses the ideal amounts. Festival groups (like "Diwali") can be 2x or 3x for all items, or a custom amount per item. Admin assigns a group to dates, so the app picks the right list on its own.
- [ ] **3. Stock check (Checker).** Open today's list and enter how much of each item is there, using a dial or number box that matches the item's unit.
- [ ] **4. Shopping report (automatic).** Compare stock with today's ideal list. Show what is enough and what is short, with how much to buy. Buying links to the supplier come later, as an extra.
- [ ] **5. Invoice check (Admin).** Enter the invoice when the order arrives. Compare it with what was ordered and make a "still missing" list to buy from local shops.

## How we'll build it

Same way as the other apps: code on GitHub, live on Vercel. We start with parts 1 and 2 on 30 Sep 2026, since everything else depends on them.

## Questions to ask the restaurant

- [ ] How often do they check stock: daily, or a few times a week?
- [ ] Which website or supplier do they order from?
- [ ] Roughly how many items are on the list?
