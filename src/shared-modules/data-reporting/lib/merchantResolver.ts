/**
 * Merchant resolver — detects ambiguity when a user specifies a merchant by name.
 * Uses the DB to look up matching merchants and surfaces options for clarification.
 */

import type { SqlServerClient } from './sqlServerClient.js';

export interface MerchantMatch {
  mid: string;
  name: string;
  city?: string;
  region?: string;
}

export interface MerchantResolution {
  found: boolean;
  exact: boolean;           // single unambiguous match
  ambiguous: boolean;       // multiple matches found
  matches: MerchantMatch[];
  clarificationText?: string;
}

export class MerchantResolver {
  constructor(private readonly db: SqlServerClient) {}

  async resolve(merchantNameOrId: string): Promise<MerchantResolution> {
    // If it looks like a numeric MID, do an exact ID lookup.
    if (/^\d+$/.test(merchantNameOrId.trim())) {
      return this.resolveById(merchantNameOrId.trim());
    }
    return this.resolveByName(merchantNameOrId.trim());
  }

  private async resolveById(mid: string): Promise<MerchantResolution> {
    const result = await this.db.query(`
      SELECT TOP 1
        m.id   AS mid,
        m.name AS name,
        c.name AS city,
        CASE
          WHEN r.id = 2          THEN 'Central'
          WHEN r.id IN (3,5,6,7) THEN 'North'
          WHEN r.id IN (1,4)     THEN 'South'
          ELSE ISNULL(r.name, 'Unknown')
        END AS region
      FROM openmms.dbo.merchant m
      LEFT JOIN openmms.dbo.merchant_kyc mk ON mk.merchant_id = m.id
      LEFT JOIN openmms.dbo.city c ON c.id = mk.city_id
      LEFT JOIN openmms.dbo.region r ON r.id = c.region_id
      WHERE m.id = ${parseInt(mid, 10)}
        AND m.status = 'active'
        AND m.digital_onboarding_type = 'MPOS'
    `);

    if (result.rows.length === 0) {
      return { found: false, exact: false, ambiguous: false, matches: [] };
    }

    const row = result.rows[0];
    return {
      found: true,
      exact: true,
      ambiguous: false,
      matches: [{
        mid: String(row['mid']),
        name: String(row['name']),
        city: row['city'] ? String(row['city']) : undefined,
        region: row['region'] ? String(row['region']) : undefined,
      }],
    };
  }

  private async resolveByName(name: string): Promise<MerchantResolution> {
    // Sanitize: only allow alphanumeric + spaces + common punctuation for LIKE param.
    const safeName = name.replace(/'/g, "''");

    const result = await this.db.query(`
      SELECT TOP 10
        m.id   AS mid,
        m.name AS name,
        c.name AS city,
        CASE
          WHEN r.id = 2          THEN 'Central'
          WHEN r.id IN (3,5,6,7) THEN 'North'
          WHEN r.id IN (1,4)     THEN 'South'
          ELSE ISNULL(r.name, 'Unknown')
        END AS region
      FROM openmms.dbo.merchant m
      LEFT JOIN openmms.dbo.merchant_kyc mk ON mk.merchant_id = m.id
      LEFT JOIN openmms.dbo.city c ON c.id = mk.city_id
      LEFT JOIN openmms.dbo.region r ON r.id = c.region_id
      WHERE m.name LIKE '%${safeName}%'
        AND m.status = 'active'
        AND m.digital_onboarding_type = 'MPOS'
      ORDER BY m.name
    `);

    if (result.rows.length === 0) {
      return { found: false, exact: false, ambiguous: false, matches: [] };
    }

    const matches: MerchantMatch[] = result.rows.map((row) => ({
      mid: String(row['mid']),
      name: String(row['name']),
      city: row['city'] ? String(row['city']) : undefined,
      region: row['region'] ? String(row['region']) : undefined,
    }));

    if (matches.length === 1) {
      return { found: true, exact: true, ambiguous: false, matches };
    }

    const listText = matches
      .map((m, i) => `${i + 1}) ${m.name} | MID: ${m.mid} | ${m.region ?? 'Unknown'}`)
      .join('\n');

    return {
      found: true,
      exact: false,
      ambiguous: true,
      matches,
      clarificationText:
        `Multiple merchants found for "${name}". Please specify the MID:\n${listText}`,
    };
  }
}
