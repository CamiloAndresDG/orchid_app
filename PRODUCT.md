# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Farmers and agronomists planning crop rotations for their own fields (demo zones: Sumner County, Kansas, wheat-fallow; Story County, Iowa, corn-soy). They use the tool as decision support before committing to next seasons' rotation. The hackathon context (NASA Space Apps 2026 judges) is a secondary audience; the product story stays the farmer's.

## Product Purpose

Field Shift is a decision-support tool for the NASA Space Apps 2026 challenge "Field Shift: Adapting Farms with NASA Data". It combines NASA Earth observations with local soil, crop characteristics and farmer priorities to compare rotation strategies for soil health and climate resilience. It supports the farmer's judgment; it never replaces it.

## Positioning

Compares at least 3 rotation strategies (including the current one) and, for each, shows why it is suggested, the supporting evidence, benefits, information gaps, and risks that farmers or local experts must review. Honesty about evidence and gaps is the differentiator.

## Operating Context

Backend FastAPI (zones, NASA POWER, vulnerability, strategies); frontend Next.js + MapLibre + Recharts. Vulnerability currently uses monthly NASA POWER climate (rainfall, temperature, root-zone moisture); non-crop months come from fixed calendars.

## Capabilities and Constraints

- UI is bilingual English/Spanish.
- Only real NASA POWER data may be shown. Not yet wired (NDVI via HLS/MODIS, CDL rotation history, SSURGO soils, SMAP, Claude API agent) must not be displayed as if real; show gaps explicitly instead.
- 13 of the 24 catalogued data sources are US-only (see docs/).

## Evidence on Hand

Verified source catalog in docs/ (24 sources). No real farmer testimonials, customers, or benchmarks exist; none may be invented.

## Product Principles

1. Support, don't replace, the farmer's judgment.
2. Every recommendation carries its evidence, gaps, and risks.
3. Never display data the product does not actually have.
4. Plain language over agronomy jargon, in both English and Spanish.
