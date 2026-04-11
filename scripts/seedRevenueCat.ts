import { createClient } from "@replit/revenuecat-sdk/client";
import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "Erebus";

const MONTHLY_PRODUCT_IDENTIFIER = "premium_monthly";
const MONTHLY_PLAY_STORE_PRODUCT_IDENTIFIER = "premium_monthly:monthly";
const MONTHLY_PRODUCT_DISPLAY_NAME = "Premium Monthly";
const MONTHLY_PRODUCT_USER_FACING_TITLE = "Premium Monthly";
const MONTHLY_PRODUCT_DURATION = "P1M" as const;

const ANNUAL_PRODUCT_IDENTIFIER = "premium_annual";
const ANNUAL_PLAY_STORE_PRODUCT_IDENTIFIER = "premium_annual:annual";
const ANNUAL_PRODUCT_DISPLAY_NAME = "Premium Annual";
const ANNUAL_PRODUCT_USER_FACING_TITLE = "Premium Annual";
const ANNUAL_PRODUCT_DURATION = "P1Y" as const;

const APP_STORE_APP_NAME = "Erebus iOS";
const APP_STORE_BUNDLE_ID = "com.erebus.diveapp";
const PLAY_STORE_APP_NAME = "Erebus Android";
const PLAY_STORE_PACKAGE_NAME = "com.erebus.diveapp";

const ENTITLEMENT_IDENTIFIER = "premium";
const ENTITLEMENT_DISPLAY_NAME = "Premium Access";

const OFFERING_IDENTIFIER = "default";
const OFFERING_DISPLAY_NAME = "Default Offering";

const MONTHLY_PACKAGE_IDENTIFIER = "$rc_monthly";
const MONTHLY_PACKAGE_DISPLAY_NAME = "Monthly Subscription";

const ANNUAL_PACKAGE_IDENTIFIER = "$rc_annual";
const ANNUAL_PACKAGE_DISPLAY_NAME = "Annual Subscription";

const MONTHLY_PRODUCT_PRICES = [
  { amount_micros: 7990000, currency: "USD" },
  { amount_micros: 6990000, currency: "EUR" },
];

const ANNUAL_PRODUCT_PRICES = [
  { amount_micros: 59990000, currency: "USD" },
  { amount_micros: 54990000, currency: "EUR" },
];

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

async function seedRevenueCat() {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) {
    throw new Error("REVENUECAT_SECRET_API_KEY environment variable is not set");
  }

  const client = createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });

  if (listProjectsError) throw new Error("Failed to list projects: " + JSON.stringify(listProjectsError));

  const existingProject = existingProjects.items?.find((p) => p.name === PROJECT_NAME);

  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data: newProject, error: createProjectError } = await createProject({
      client,
      body: { name: PROJECT_NAME },
    });
    if (createProjectError) throw new Error("Failed to create project: " + JSON.stringify(createProjectError));
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listAppsError) throw new Error("Failed to list apps: " + JSON.stringify(listAppsError));

  let app: App | undefined = apps?.items?.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps?.items?.find((a) => a.type === "app_store");
  let playStoreApp: App | undefined = apps?.items?.find((a) => a.type === "play_store");

  if (!app) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: "Erebus Test Store",
        type: "test_store",
      },
    });
    if (error) throw new Error("Failed to create Test Store app: " + JSON.stringify(error));
    app = newApp;
    console.log("Created Test Store app:", app.id);
  } else {
    console.log("Test Store app found:", app.id);
  }

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: APP_STORE_APP_NAME,
        type: "app_store",
        app_store: { bundle_id: APP_STORE_BUNDLE_ID },
      },
    });
    if (error) throw new Error("Failed to create App Store app: " + JSON.stringify(error));
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app found:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: {
        name: PLAY_STORE_APP_NAME,
        type: "play_store",
        play_store: { package_name: PLAY_STORE_PACKAGE_NAME },
      },
    });
    if (error) throw new Error("Failed to create Play Store app: " + JSON.stringify(error));
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app found:", playStoreApp.id);
  }

  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });

  if (listProductsError) throw new Error("Failed to list products");

  const ensureProductForApp = async (
    targetApp: App,
    label: string,
    productIdentifier: string,
    isTestStore: boolean,
    displayName: string,
    userFacingTitle: string,
    duration: string,
  ): Promise<Product> => {
    const existingProduct = existingProducts.items?.find(
      (p) => p.store_identifier === productIdentifier && p.app_id === targetApp.id,
    );

    if (existingProduct) {
      console.log(label + " product already exists:", existingProduct.id);
      return existingProduct;
    }

    const body: CreateProductData["body"] = {
      store_identifier: productIdentifier,
      app_id: targetApp.id,
      type: "subscription",
      display_name: displayName,
    };

    if (isTestStore) {
      (body as Record<string, unknown>).subscription = { duration };
      body.title = userFacingTitle;
    }

    const { data: createdProduct, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });

    if (error) throw new Error("Failed to create " + label + " product: " + JSON.stringify(error));
    console.log("Created " + label + " product:", createdProduct.id);
    return createdProduct;
  };

  const monthlyTestProduct = await ensureProductForApp(app, "Test Store Monthly", MONTHLY_PRODUCT_IDENTIFIER, true, MONTHLY_PRODUCT_DISPLAY_NAME, MONTHLY_PRODUCT_USER_FACING_TITLE, MONTHLY_PRODUCT_DURATION);
  const monthlyAppStoreProduct = await ensureProductForApp(appStoreApp, "App Store Monthly", MONTHLY_PRODUCT_IDENTIFIER, false, MONTHLY_PRODUCT_DISPLAY_NAME, MONTHLY_PRODUCT_USER_FACING_TITLE, MONTHLY_PRODUCT_DURATION);
  const monthlyPlayStoreProduct = await ensureProductForApp(playStoreApp, "Play Store Monthly", MONTHLY_PLAY_STORE_PRODUCT_IDENTIFIER, false, MONTHLY_PRODUCT_DISPLAY_NAME, MONTHLY_PRODUCT_USER_FACING_TITLE, MONTHLY_PRODUCT_DURATION);

  const annualTestProduct = await ensureProductForApp(app, "Test Store Annual", ANNUAL_PRODUCT_IDENTIFIER, true, ANNUAL_PRODUCT_DISPLAY_NAME, ANNUAL_PRODUCT_USER_FACING_TITLE, ANNUAL_PRODUCT_DURATION);
  const annualAppStoreProduct = await ensureProductForApp(appStoreApp, "App Store Annual", ANNUAL_PRODUCT_IDENTIFIER, false, ANNUAL_PRODUCT_DISPLAY_NAME, ANNUAL_PRODUCT_USER_FACING_TITLE, ANNUAL_PRODUCT_DURATION);
  const annualPlayStoreProduct = await ensureProductForApp(playStoreApp, "Play Store Annual", ANNUAL_PLAY_STORE_PRODUCT_IDENTIFIER, false, ANNUAL_PRODUCT_DISPLAY_NAME, ANNUAL_PRODUCT_USER_FACING_TITLE, ANNUAL_PRODUCT_DURATION);

  const addTestStorePrices = async (product: Product, prices: typeof MONTHLY_PRODUCT_PRICES, label: string) => {
    console.log(`Adding test store prices for ${label}:`, JSON.stringify(prices));
    const { data: priceData, error: priceError } = await client.post<TestStorePricesResponse>({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: product.id },
      body: { prices },
    });

    if (priceError) {
      if (priceError && typeof priceError === "object" && "type" in priceError && priceError["type"] === "resource_already_exists") {
        console.log(`Test store prices already exist for ${label}`);
      } else {
        throw new Error(`Failed to add test store prices for ${label}: ` + JSON.stringify(priceError));
      }
    } else {
      console.log(`Successfully added test store prices for ${label}`);
    }
  };

  await addTestStorePrices(monthlyTestProduct, MONTHLY_PRODUCT_PRICES, "monthly");
  await addTestStorePrices(annualTestProduct, ANNUAL_PRODUCT_PRICES, "annual");

  let entitlement: Entitlement | undefined;
  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const existingEntitlement = existingEntitlements.items?.find((e) => e.lookup_key === ENTITLEMENT_IDENTIFIER);

  if (existingEntitlement) {
    console.log("Entitlement already exists:", existingEntitlement.id);
    entitlement = existingEntitlement;
  } else {
    const { data: newEntitlement, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: {
        lookup_key: ENTITLEMENT_IDENTIFIER,
        display_name: ENTITLEMENT_DISPLAY_NAME,
      },
    });
    if (error) throw new Error("Failed to create entitlement");
    console.log("Created entitlement:", newEntitlement.id);
    entitlement = newEntitlement;
  }

  const allProductIds = [
    monthlyTestProduct.id, monthlyAppStoreProduct.id, monthlyPlayStoreProduct.id,
    annualTestProduct.id, annualAppStoreProduct.id, annualPlayStoreProduct.id,
  ];

  const { error: attachEntitlementError } = await attachProductsToEntitlement({
    client,
    path: { project_id: project.id, entitlement_id: entitlement.id },
    body: { product_ids: allProductIds },
  });

  if (attachEntitlementError) {
    if (attachEntitlementError.type === "unprocessable_entity_error") {
      console.log("Products already attached to entitlement");
    } else {
      throw new Error("Failed to attach products to entitlement");
    }
  } else {
    console.log("Attached all products to entitlement");
  }

  let offering: Offering | undefined;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });

  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOffering = existingOfferings.items?.find((o) => o.lookup_key === OFFERING_IDENTIFIER);

  if (existingOffering) {
    console.log("Offering already exists:", existingOffering.id);
    offering = existingOffering;
  } else {
    const { data: newOffering, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: {
        lookup_key: OFFERING_IDENTIFIER,
        display_name: OFFERING_DISPLAY_NAME,
      },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", newOffering.id);
    offering = newOffering;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  const createOrGetPackage = async (
    packageIdentifier: string,
    packageDisplayName: string,
    testProduct: Product,
    appStoreProduct: Product,
    playStoreProduct: Product,
  ): Promise<Package> => {
    const { data: existingPackages, error: listPackagesError } = await listPackages({
      client,
      path: { project_id: project.id, offering_id: offering!.id },
      query: { limit: 20 },
    });

    if (listPackagesError) throw new Error("Failed to list packages");

    const existingPackage = existingPackages.items?.find((p) => p.lookup_key === packageIdentifier);

    let pkg: Package;
    if (existingPackage) {
      console.log(`Package ${packageIdentifier} already exists:`, existingPackage.id);
      pkg = existingPackage;
    } else {
      const { data: newPackage, error } = await createPackages({
        client,
        path: { project_id: project.id, offering_id: offering!.id },
        body: {
          lookup_key: packageIdentifier,
          display_name: packageDisplayName,
        },
      });
      if (error) throw new Error(`Failed to create package ${packageIdentifier}: ` + JSON.stringify(error));
      console.log(`Created package ${packageIdentifier}:`, newPackage.id);
      pkg = newPackage;
    }

    const { error: attachPackageError } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: [
          { product_id: testProduct.id, eligibility_criteria: "all" },
          { product_id: appStoreProduct.id, eligibility_criteria: "all" },
          { product_id: playStoreProduct.id, eligibility_criteria: "all" },
        ],
      },
    });

    if (attachPackageError) {
      if (attachPackageError.type === "unprocessable_entity_error") {
        console.log(`Package ${packageIdentifier} already has products attached`);
      } else {
        throw new Error(`Failed to attach products to package ${packageIdentifier}`);
      }
    } else {
      console.log(`Attached products to package ${packageIdentifier}`);
    }

    return pkg;
  };

  await createOrGetPackage(MONTHLY_PACKAGE_IDENTIFIER, MONTHLY_PACKAGE_DISPLAY_NAME, monthlyTestProduct, monthlyAppStoreProduct, monthlyPlayStoreProduct);
  await createOrGetPackage(ANNUAL_PACKAGE_IDENTIFIER, ANNUAL_PACKAGE_DISPLAY_NAME, annualTestProduct, annualAppStoreProduct, annualPlayStoreProduct);

  const { data: testStoreApiKeys, error: testStoreApiKeysError } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: app.id },
  });
  if (testStoreApiKeysError) throw new Error("Failed to list public API keys for Test Store app");

  const { data: appStoreApiKeys, error: appStoreApiKeysError } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: appStoreApp.id },
  });
  if (appStoreApiKeysError) throw new Error("Failed to list public API keys for App Store app");

  const { data: playStoreApiKeys, error: playStoreApiKeysError } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: playStoreApp.id },
  });
  if (playStoreApiKeysError) throw new Error("Failed to list public API keys for Play Store app");

  console.log("\n====================");
  console.log("RevenueCat setup complete!");
  console.log("Project ID:", project.id);
  console.log("Test Store App ID:", app.id);
  console.log("App Store App ID:", appStoreApp.id);
  console.log("Play Store App ID:", playStoreApp.id);
  console.log("Entitlement Identifier:", ENTITLEMENT_IDENTIFIER);
  console.log("Public API Keys - Test Store:", testStoreApiKeys?.items.map((item) => item.key).join(", ") ?? "N/A");
  console.log("Public API Keys - App Store:", appStoreApiKeys?.items.map((item) => item.key).join(", ") ?? "N/A");
  console.log("Public API Keys - Play Store:", playStoreApiKeys?.items.map((item) => item.key).join(", ") ?? "N/A");
  console.log("====================\n");
}

seedRevenueCat().catch(console.error);
