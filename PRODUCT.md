# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Farmers and agronomists planning crop rotations for their own fields (demo zones: Sumner County, Kansas, wheat-fallow; Story County, Iowa, corn-soy). They use the tool as decision support before committing to next seasons' rotation. The hackathon context (NASA Space Apps 2026 judges) is a secondary audience; the product story stays the farmer's.

## Product Purpose

Orchid is a decision-support tool for the NASA Space Apps 2026 challenge "Field Shift: Adapting Farms with NASA Data". It combines NASA Earth observations with local soil, crop characteristics and farmer priorities to compare rotation strategies for soil health and climate resilience. It supports the farmer's judgment; it never replaces it.

## Positioning

Compares at least 3 rotation strategies (including the current one) and, for each, shows why it is suggested, the supporting evidence, benefits, information gaps, and risks that farmers or local experts must review. Honesty about evidence and gaps is the differentiator.

## Operating Context

Backend FastAPI (zones, NASA POWER, vulnerability, strategies); frontend Next.js + MapLibre + Recharts. Vulnerability uses monthly NASA POWER climate with weights chosen by Orchid. For the farmer's plot, bare-soil months come from MODIS NDVI or the declared history; fixed crop calendars are used only for the two example zones. The rotation engine is a set of hand-written rules (RULES in recommend.py) that the full report shows with their numbers; they are not yet validated by an agronomist.

## Capabilities and Constraints

- UI is bilingual English/Spanish.
- Only real data from connected sources may be shown: NASA POWER, MODIS NDVI, SMAP, GPM IMERG, NLDAS-2 and SRTM (NASA), SSURGO, CDL and QuickStats (USDA), FAO GAEZ and CoCoRaHS. Anything not connected must not be displayed as if real; show gaps explicitly instead.
- 13 of the 24 catalogued data sources are US-only (see docs/).

## Evidence on Hand

Verified source catalog in docs/ (24 sources). No real farmer testimonials, customers, or benchmarks exist; none may be invented.

## Product Principles

1. Support, don't replace, the farmer's judgment.
2. Every recommendation carries its evidence, gaps, and risks.
3. Never display data the product does not actually have.
4. Plain language over agronomy jargon, in both English and Spanish.
