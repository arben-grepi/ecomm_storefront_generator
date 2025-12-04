#!/usr/bin/env node

/**
 * Script to check shipping rates from Shopify
 * 
 * This script queries Shopify's Delivery Profiles API to check:
 * 1. All shipping zones and their countries
 * 2. Shipping methods (standard, express, etc.) and their rates
 * 3. Which countries are covered by which shipping zones
 * 
 * Usage:
 *   node scripts/check-shipping-rates.js [countryCode]
 * 
 * Examples:
 *   node scripts/check-shipping-rates.js
 *   node scripts/check-shipping-rates.js DE
 *   node scripts/check-shipping-rates.js FI
 */

require('dotenv').config({ path: '.env.local' });

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2025-10';

// Get optional country code filter from command line
const filterCountry = process.argv[2] ? process.argv[2].toUpperCase() : null;

function getAdminCredentials() {
  const storeUrl = SHOPIFY_STORE_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const accessToken = SHOPIFY_ACCESS_TOKEN;
  
  if (!storeUrl || !accessToken) {
    console.error('\n❌ Missing Shopify Admin API credentials!\n');
    console.error('Required environment variables:');
    console.error('  - SHOPIFY_STORE_URL');
    console.error('  - SHOPIFY_ACCESS_TOKEN');
    console.error('\nPlease check your .env.local file.\n');
    process.exit(1);
  }
  
  return { storeUrl, accessToken };
}

/**
 * Fetch shipping rates from Shopify Admin API
 */
async function fetchShippingRates(storeUrl, accessToken) {
  const query = `
    query {
      deliveryProfiles(first: 10) {
        edges {
          node {
            id
            name
            profileLocationGroups {
              locationGroupZones(first: 20) {
                edges {
                  node {
                    zone {
                      id
                      name
                      countries {
                        code {
                          countryCode
                        }
                      }
                    }
                    methodDefinitions(first: 10) {
                      edges {
                        node {
                          id
                          name
                          description
                          active
                          rateProvider {
                            ... on DeliveryRateDefinition {
                              id
                              price {
                                amount
                                currencyCode
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const url = `https://${storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  return data.data;
}

/**
 * Format and display shipping rates
 */
function displayShippingRates(data, filterCountry) {
  console.log('\n📦 Shopify Shipping Rates Configuration\n');
  console.log('='.repeat(80));
  
  if (!data.deliveryProfiles || data.deliveryProfiles.edges.length === 0) {
    console.log('\n⚠️  No delivery profiles found. You may need to configure shipping in Shopify Admin.\n');
    console.log('To set up shipping:');
    console.log('  1. Go to Shopify Admin → Settings → Shipping and delivery');
    console.log('  2. Create a delivery profile or edit an existing one');
    console.log('  3. Add shipping zones for your markets');
    console.log('  4. Configure shipping methods (standard, express, etc.)\n');
    return;
  }

  const ratesByCountry = {};
  let totalZones = 0;
  let totalCountries = 0;
  const allCountries = new Set();

  // Process all delivery profiles
  data.deliveryProfiles.edges.forEach(profileEdge => {
    const profile = profileEdge.node;
    console.log(`\n📋 Delivery Profile: ${profile.name}`);
    console.log(`   ID: ${profile.id}\n`);

    const locationGroups = profile.profileLocationGroups || [];
    
    locationGroups.forEach(group => {
      const zones = group.locationGroupZones?.edges || [];
      
      zones.forEach(zoneEdge => {
        totalZones++;
        const zone = zoneEdge.node;
        const zoneName = zone.zone?.name || 'Unnamed Zone';
        const countries = zone.zone?.countries || [];
        
        console.log(`  🌍 Shipping Zone: ${zoneName}`);
        console.log(`     Zone ID: ${zone.zone?.id || 'N/A'}\n`);

        // Get active shipping methods with prices
        const methods = (zone.methodDefinitions?.edges || [])
          .filter(m => m.node.active && m.node.rateProvider)
          .map(m => ({
            id: m.node.id,
            name: m.node.name,
            description: m.node.description || '',
            price: parseFloat(m.node.rateProvider.price?.amount || 0),
            currency: m.node.rateProvider.price?.currencyCode || 'EUR'
          }))
          .filter(m => m.price >= 0);

        if (methods.length === 0) {
          console.log(`     ⚠️  No active shipping methods found for this zone\n`);
          return;
        }

        // Display methods
        methods.forEach(method => {
          console.log(`     🚚 ${method.name}`);
          if (method.description) {
            console.log(`        Description: ${method.description}`);
          }
          console.log(`        Rate: ${method.price.toFixed(2)} ${method.currency}`);
          console.log(`        Method ID: ${method.id}\n`);
        });

        // Process countries
        countries.forEach(country => {
          const countryCode = country.code?.countryCode;
          if (!countryCode) return;

          allCountries.add(countryCode);
          
          // Filter by country if specified
          if (filterCountry && countryCode !== filterCountry) {
            return;
          }

          if (!ratesByCountry[countryCode]) {
            ratesByCountry[countryCode] = [];
            totalCountries++;
          }

          // Find standard rate (by name or lowest price)
          const standardRate = methods.find(m => 
            m.name.toLowerCase().includes('standard')
          ) || methods.sort((a, b) => a.price - b.price)[0];

          ratesByCountry[countryCode].push({
            zoneName,
            profileName: profile.name,
            standard: standardRate ? {
              name: standardRate.name,
              price: standardRate.price,
              currency: standardRate.currency
            } : null,
            allMethods: methods
          });
        });
      });
    });
  });

  // Display summary by country
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Summary by Country\n');

  if (filterCountry) {
    if (ratesByCountry[filterCountry]) {
      console.log(`\n✅ ${filterCountry} - Found ${ratesByCountry[filterCountry].length} shipping zone(s):\n`);
      ratesByCountry[filterCountry].forEach((rate, index) => {
        console.log(`  ${index + 1}. Zone: ${rate.zoneName}`);
        if (rate.standard) {
          console.log(`     Standard Shipping: ${rate.standard.name} - ${rate.standard.price.toFixed(2)} ${rate.standard.currency}`);
        } else {
          console.log(`     ⚠️  No standard shipping method found`);
        }
        if (rate.allMethods.length > 1) {
          console.log(`     Other methods: ${rate.allMethods.filter(m => m.name !== rate.standard?.name).map(m => `${m.name} (${m.price.toFixed(2)} ${m.currency})`).join(', ')}`);
        }
        console.log('');
      });
    } else {
      console.log(`\n❌ ${filterCountry} - No shipping zones found for this country.\n`);
      console.log('To add shipping for this country:');
      console.log('  1. Go to Shopify Admin → Settings → Shipping and delivery');
      console.log('  2. Edit your delivery profile');
      console.log('  3. Add or edit a shipping zone');
      console.log('  4. Add this country to the zone\n');
    }
  } else {
    // Display all countries
    const sortedCountries = Array.from(allCountries).sort();
    
    sortedCountries.forEach(countryCode => {
      const rates = ratesByCountry[countryCode] || [];
      if (rates.length === 0) return;

      console.log(`\n📍 ${countryCode} - ${rates.length} zone(s):`);
      rates.forEach((rate, index) => {
        console.log(`   ${index + 1}. ${rate.zoneName}`);
        if (rate.standard) {
          console.log(`      Standard: ${rate.standard.name} - ${rate.standard.price.toFixed(2)} ${rate.standard.currency}`);
        }
      });
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\n📈 Statistics:`);
    console.log(`   • Total Delivery Profiles: ${data.deliveryProfiles.edges.length}`);
    console.log(`   • Total Shipping Zones: ${totalZones}`);
    console.log(`   • Total Countries Covered: ${totalCountries}`);
    console.log(`   • All Countries: ${Array.from(allCountries).sort().join(', ')}\n`);
  }

  // Check for standard shipping first
  let hasStandardShipping = false;
  Object.values(ratesByCountry).forEach(rates => {
    rates.forEach(rate => {
      if (rate.standard && rate.standard.name.toLowerCase().includes('standard')) {
        hasStandardShipping = true;
      }
    });
  });

  // Recommendations
  console.log('\n💡 Recommendations:\n');
  
  // Check if setup is simplified (1 zone, standard shipping)
  const configuredCountries = Array.from(allCountries).sort();
  const isSimplified = totalZones === 1 && hasStandardShipping;
  
  if (isSimplified) {
    console.log('✅ Your shipping setup is simplified!');
    console.log(`   • One unified shipping zone covering ${configuredCountries.length} countr${configuredCountries.length === 1 ? 'y' : 'ies'}: ${configuredCountries.join(', ')}`);
    console.log('   • Standard shipping configured');
    console.log('   • Perfect for current markets\n');
  } else if (!hasStandardShipping) {
    console.log('⚠️  No "standard" shipping method found. Consider:');
    console.log('   1. Renaming your primary shipping method to include "standard" in the name');
    console.log('   2. Or ensuring you have a clear standard shipping option\n');
  }
  
  // Future expansion options (only show if not all European countries are covered)
  const europeanCountries = ['FI', 'DE', 'SE', 'NO', 'DK', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'PL', 'CZ', 'IE'];
  const expansionCountries = europeanCountries.filter(code => !allCountries.has(code));
  
  if (expansionCountries.length > 0 && configuredCountries.length < 5) {
    console.log('📋 Future expansion options:');
    console.log(`   You can easily add these countries to your existing zone: ${expansionCountries.join(', ')}`);
    console.log('   Just edit your "Europe" zone in Shopify Admin and add more countries.\n');
  } else if (expansionCountries.length > 0) {
    console.log('📋 Additional European countries you could add:');
    console.log(`   ${expansionCountries.join(', ')}\n`);
  }

  // Check for unified shipping zone
  if (totalZones > 1) {
    console.log('💡 You have multiple shipping zones. For simplified shipping:');
    console.log('   Consider consolidating into one general shipping zone for all markets.\n');
  }

  console.log('='.repeat(80) + '\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    const { storeUrl, accessToken } = getAdminCredentials();
    
    console.log('\n🔍 Fetching shipping rates from Shopify...\n');
    console.log(`Store: ${storeUrl}`);
    if (filterCountry) {
      console.log(`Filter: ${filterCountry}\n`);
    }

    const data = await fetchShippingRates(storeUrl, accessToken);
    displayShippingRates(data, filterCountry);
    
  } catch (error) {
    console.error('\n❌ Error fetching shipping rates:\n');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
main();

