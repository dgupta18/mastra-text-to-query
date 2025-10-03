import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { MongoClient } from 'mongodb';

const createDatabaseConnection = async (connectionString) => {
  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 3e4,
    // 30 seconds
    connectTimeoutMS: 3e4,
    // 30 seconds
    socketTimeoutMS: 6e4
    // 1 minute
  });
  await client.connect();
  const url = new URL(connectionString);
  const dbName = url.pathname.slice(1) || "test";
  const db = client.db(dbName);
  return { client, db };
};
const databaseSeedingTool = createTool({
  id: "database-seeding",
  inputSchema: z.object({
    connectionString: z.string().describe("MongoDB connection string"),
    seedType: z.enum(["ecommerce", "social", "financial", "custom"]).optional().default("ecommerce"),
    dropExisting: z.boolean().optional().default(false),
    recordCount: z.number().optional().default(100)
  }),
  description: "Seeds a MongoDB database with sample collections and documents for testing and demonstration purposes",
  execute: async ({ context: { connectionString, seedType, dropExisting, recordCount } }) => {
    let client = null;
    try {
      console.log("\u{1F50C} Connecting to MongoDB for seeding...");
      const { client: mongoClient, db } = await createDatabaseConnection(connectionString);
      client = mongoClient;
      console.log("\u2705 Connected to MongoDB for seeding");
      const seedResults = [];
      const collections = [];
      switch (seedType) {
        case "ecommerce":
          const ecommerceResult = await seedEcommerceData(db, dropExisting || false, recordCount || 100);
          seedResults.push(...ecommerceResult.results);
          collections.push(...ecommerceResult.collections);
          break;
        case "social":
          const socialResult = await seedSocialData(db, dropExisting || false, recordCount || 100);
          seedResults.push(...socialResult.results);
          collections.push(...socialResult.collections);
          break;
        case "financial":
          const financialResult = await seedFinancialData(db, dropExisting || false, recordCount || 100);
          seedResults.push(...financialResult.results);
          collections.push(...financialResult.collections);
          break;
        default:
          throw new Error(`Unsupported seed type: ${seedType}`);
      }
      const totalRecords = seedResults.reduce((sum, result) => sum + (result.insertedCount || 0), 0);
      return {
        success: true,
        message: `Successfully seeded ${totalRecords} documents across ${collections.length} collections`,
        seedType,
        collectionsCreated: collections,
        recordCount: totalRecords,
        details: seedResults
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to seed database: ${error instanceof Error ? error.message : String(error)}`,
        seedType,
        collectionsCreated: [],
        recordCount: 0
      };
    } finally {
      if (client) {
        await client.close();
      }
    }
  }
});
async function seedEcommerceData(db, dropExisting, recordCount) {
  const collections = ["products", "categories", "customers", "orders"];
  const results = [];
  if (dropExisting) {
    for (const collectionName of collections) {
      try {
        await db.collection(collectionName).drop();
        console.log(`Dropped collection: ${collectionName}`);
      } catch (error) {
      }
    }
  }
  const categories = [
    { _id: "electronics", name: "Electronics", description: "Electronic devices and gadgets" },
    { _id: "clothing", name: "Clothing", description: "Fashion and apparel" },
    { _id: "books", name: "Books", description: "Books and literature" },
    { _id: "home", name: "Home & Garden", description: "Home improvement and garden supplies" },
    { _id: "sports", name: "Sports", description: "Sports and outdoor equipment" }
  ];
  const categoryResult = await db.collection("categories").insertMany(categories);
  results.push({ collection: "categories", insertedCount: categoryResult.insertedCount });
  const products = [];
  const productNames = [
    "Smartphone",
    "Laptop",
    "Headphones",
    "T-Shirt",
    "Jeans",
    "Novel",
    "Cookbook",
    "Lamp",
    "Chair",
    "Basketball",
    "Running Shoes",
    "Tablet",
    "Watch",
    "Backpack"
  ];
  for (let i = 0; i < Math.min(recordCount, 200); i++) {
    const categoryIds = categories.map((c) => c._id);
    const product = {
      name: `${productNames[i % productNames.length]} ${i + 1}`,
      category: categoryIds[i % categoryIds.length],
      price: Math.round((Math.random() * 500 + 10) * 100) / 100,
      description: `High-quality ${productNames[i % productNames.length].toLowerCase()} with excellent features`,
      inStock: Math.floor(Math.random() * 100),
      rating: Math.round((Math.random() * 2 + 3) * 10) / 10,
      // 3.0 to 5.0
      tags: generateRandomTags(),
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1e3),
      updatedAt: /* @__PURE__ */ new Date()
    };
    products.push(product);
  }
  const productResult = await db.collection("products").insertMany(products);
  results.push({ collection: "products", insertedCount: productResult.insertedCount });
  const customers = [];
  const firstNames = ["John", "Jane", "Mike", "Sarah", "David", "Emma", "Chris", "Lisa"];
  const lastNames = ["Smith", "Johnson", "Brown", "Davis", "Wilson", "Miller", "Taylor", "Anderson"];
  const cities = ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego"];
  for (let i = 0; i < Math.min(recordCount / 2, 100); i++) {
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[i % lastNames.length];
    const customer = {
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
      city: cities[i % cities.length],
      country: "USA",
      registeredAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1e3),
      isActive: Math.random() > 0.1,
      // 90% active
      preferences: {
        newsletter: Math.random() > 0.3,
        notifications: Math.random() > 0.5,
        favoriteCategories: [categories[i % categories.length]._id, categories[(i + 1) % categories.length]._id]
      }
    };
    customers.push(customer);
  }
  const customerResult = await db.collection("customers").insertMany(customers);
  results.push({ collection: "customers", insertedCount: customerResult.insertedCount });
  const orders = [];
  const customerIds = customers.map((_, index) => customerResult.insertedIds[index]);
  const productIds = products.map((_, index) => productResult.insertedIds[index]);
  for (let i = 0; i < Math.min(recordCount * 1.5, 300); i++) {
    const customerId = customerIds[i % customerIds.length];
    const orderItemCount = Math.floor(Math.random() * 3) + 1;
    const orderItems = [];
    let totalAmount = 0;
    for (let j = 0; j < orderItemCount; j++) {
      const productIndex = Math.floor(Math.random() * products.length);
      const product = products[productIndex];
      const quantity = Math.floor(Math.random() * 3) + 1;
      const itemTotal = product.price * quantity;
      orderItems.push({
        productId: productIds[productIndex],
        productName: product.name,
        price: product.price,
        quantity,
        total: itemTotal
      });
      totalAmount += itemTotal;
    }
    const order = {
      customerId,
      items: orderItems,
      totalAmount: Math.round(totalAmount * 100) / 100,
      status: ["pending", "processing", "shipped", "delivered", "cancelled"][Math.floor(Math.random() * 5)],
      orderDate: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1e3),
      // Last 6 months
      shippingAddress: {
        street: `${Math.floor(Math.random() * 9999)} Main St`,
        city: cities[i % cities.length],
        zipCode: `${Math.floor(Math.random() * 9e4) + 1e4}`,
        country: "USA"
      }
    };
    orders.push(order);
  }
  const orderResult = await db.collection("orders").insertMany(orders);
  results.push({ collection: "orders", insertedCount: orderResult.insertedCount });
  return { results, collections };
}
async function seedSocialData(db, dropExisting, recordCount) {
  const collections = ["users", "posts", "comments", "follows"];
  const results = [];
  if (dropExisting) {
    for (const collectionName of collections) {
      try {
        await db.collection(collectionName).drop();
      } catch (error) {
      }
    }
  }
  const users = [];
  const usernames = ["john_doe", "jane_smith", "mike_jones", "sarah_wilson", "david_brown", "emma_davis"];
  for (let i = 0; i < Math.min(recordCount / 5, 50); i++) {
    const user = {
      username: `${usernames[i % usernames.length]}_${i}`,
      email: `user${i}@example.com`,
      profilePicture: `https://example.com/avatar${i}.jpg`,
      bio: `Hello, I'm user ${i}. Welcome to my profile!`,
      followers: Math.floor(Math.random() * 1e3),
      following: Math.floor(Math.random() * 500),
      postsCount: Math.floor(Math.random() * 100),
      joinedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1e3),
      isVerified: Math.random() > 0.8,
      location: ["New York", "California", "Texas", "Florida"][Math.floor(Math.random() * 4)]
    };
    users.push(user);
  }
  const userResult = await db.collection("users").insertMany(users);
  results.push({ collection: "users", insertedCount: userResult.insertedCount });
  return { results, collections };
}
async function seedFinancialData(db, dropExisting, recordCount) {
  const collections = ["accounts", "transactions", "customers"];
  const results = [];
  if (dropExisting) {
    for (const collectionName of collections) {
      try {
        await db.collection(collectionName).drop();
      } catch (error) {
      }
    }
  }
  const accounts = [];
  const accountTypes = ["checking", "savings", "credit", "investment"];
  for (let i = 0; i < Math.min(recordCount / 3, 100); i++) {
    const account = {
      accountNumber: `ACC${String(i).padStart(6, "0")}`,
      accountType: accountTypes[i % accountTypes.length],
      balance: Math.round((Math.random() * 5e4 + 1e3) * 100) / 100,
      currency: "USD",
      openedAt: new Date(Date.now() - Math.random() * 1e3 * 24 * 60 * 60 * 1e3),
      isActive: Math.random() > 0.05,
      interestRate: accountTypes[i % accountTypes.length] === "savings" ? 0.025 : 0
    };
    accounts.push(account);
  }
  const accountResult = await db.collection("accounts").insertMany(accounts);
  results.push({ collection: "accounts", insertedCount: accountResult.insertedCount });
  return { results, collections };
}
function generateRandomTags() {
  const allTags = ["popular", "bestseller", "new", "sale", "premium", "featured", "limited", "eco-friendly"];
  const tagCount = Math.floor(Math.random() * 3) + 1;
  const shuffled = allTags.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, tagCount);
}

export { databaseSeedingTool };
