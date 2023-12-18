const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const cron = require("node-cron");
const { Sequelize, DataTypes } = require("sequelize");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken"); // Import jsonwebtoken module
const jwtSecretKey = "jhgkj4467jhjh879";

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.use(
  "/backend/uploads",
  (req, res, next) => {
    console.log("Image request:", req.url);
    next();
  },
  express.static(path.join(__dirname, "uploads"))
);


const sequelize = new Sequelize("beemobi", "root", "Rikodusanin1191", {
  host: "localhost",
  dialect: "mysql",
});

const product = sequelize.define("product", {
  productname: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  category: {
    type:DataTypes.STRING,
    allowNull:false
  },
  quantity:{
    type: DataTypes.FLOAT, 
    allowNull: false,
    defaultValue: 0,
  },
  images: {
    type: DataTypes.STRING,
    allowNull: true,
    get() {
      const imagesJSON = this.getDataValue("images");
      console.log("imagesJSON:", imagesJSON);
      return imagesJSON ? JSON.parse(imagesJSON) : [];
    },
    set(val) {
      this.setDataValue("images", JSON.stringify(val));
    },
  },
  price: {
    type: DataTypes.FLOAT, // You can use DataTypes.INTEGER if prices are in whole numbers
    allowNull: false,
    defaultValue: 0,
  },
});



const user = sequelize.define("users", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true,
  },
  name: Sequelize.STRING,
  email: Sequelize.STRING,
  password: Sequelize.STRING,
  role: {
    type: Sequelize.ENUM("admin", "standard"),
    allowNull: false,
    defaultValue: "standard",
  },
});

const cart = sequelize.define("cart", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    allowNull: false,
    primaryKey: true,
  },
  userId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  productId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
});

product.belongsTo(user, { constraints: true, onDelete: "CASCADE" });
user.hasMany(product);
user.hasMany(cart);
cart.belongsTo(product, { foreignKey: "productId" });
sequelize.sync().then(() => {
  console.log("Database synchronized");
});

app.use((req, res, next) => {
  console.log("Middleware triggered");
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      const decodedToken = jwt.verify(token, jwtSecretKey);
      req.user = {
        id: decodedToken.userId,
        name: decodedToken.name,
        role: decodedToken.role,
      };
    } catch (error) {
      console.error("Error decoding token:", error);
    }
  }
  next();
});


const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) => {
    const uniqueFilename = `${file.fieldname}_${Date.now()}${path.extname(
      file.originalname
    )}`;
    return cb(null, uniqueFilename);
  },
});

const upload = multer({
  storage: storage,
});

app.post("/api/register", async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
    const newUser = await user.create({
      name,
      email,
      password: hashedPassword,
      role,
    });
    res
      .status(201)
      .json({ message: "User registered successfully", userId: newUser.id });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Error registering user" });
  }
});

// User login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const foundUser = await user.findOne({ where: { email } });

    if (!foundUser) {
      return res
        .status(401)
        .json({ message: "Authentication failed: User not found" });
    }

    const passwordMatch = await bcrypt.compare(password, foundUser.password);

    if (!passwordMatch) {
      return res
        .status(401)
        .json({ message: "Authentication failed: Incorrect password" });
    }

    const tokenPayload = {
      userId: foundUser.id,
      name: foundUser.name,
      role: foundUser.role,
    };
    const token = jwt.sign(tokenPayload, jwtSecretKey, { expiresIn: "1h" });

    res.json({
      message: "Authentication successful",
      token,
      name: foundUser.name,
    });
    console.log(token);
  } catch (error) {
    console.error("Error authenticating user:", error);
    res.status(500).json({ message: "Error authenticating user" });
  }
});



app.get("/api/users", (req, res) => {
  // Retrieve and return user data from the database
  // Example code:
  user
    .findAll()
    .then((users) => {
      res.json(users);
    })
    .catch((error) => {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Error fetching users" });
    });
});

app.get("/api/products", async (req, res) => {
  try {
    // Assuming you have a middleware that attaches the authenticated user to the request

    // Fetch posts associated with the current user
    const products = await product.findAll({
      // Filter by the user's ID
      include: [{ model: user, attributes: ["id", "name"] }], // Include user information
    });

    const processedproducts = products.map((product) => ({
      ...product.toJSON(),
      images: product.images,
    }));

    res.json(processedproducts);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Error fetching data" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  const productId = req.params.id;

  try {
    const productInstance = await product.findByPk(productId);
    if (!productInstance) {
      return res.status(404).json({ message: "product not found" });
    }
    res.json(productInstance);
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ message: "Error fetching product" });
  }
});

app.post("/api/products", upload.array("images", 3), async (req, res, next) => {
  // Extract product details from the request body
  console.log('Received request data:', req.body);
  const { productname, description, price, product_category, quantity } = req.body;
  console.log("Received category:", product_category);
  // Validate that 'price' is a valid number
  if (isNaN(price)) {
    res.status(400).json({ message: 'Invalid price value' });
    return;
  }

  const images = req.files ? req.files.map((file) => file.filename) : [];

  try {
    // Create a new product with the provided data
    const createdProduct = await product.create({
      productname,
      description,
      images,
      category: product_category,
      price,
      quantity,
      // You can add a default userId or remove this property if it's not needed
    });

    console.log("New product added with ID:", createdProduct.id);

    res.status(201).json({
      message: "Product added successfully",
      productId: createdProduct.id,
    });
  } catch (error) {
    console.error("Error inserting data:", error);
    res.status(500).json({ message: "Error inserting data" });
  }
});



app.delete("/api/products/:id", async (req, res) => {
  const productId = req.params.id;
  console.log(productId);

  try {
    // Retrieve the product by its ID
    const Product = await product.findOne({
      where: { id: productId },
    });

    if (!Product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Delete the product
    await Product.destroy();
    
    return res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    return res.status(500).json({ message: "Error deleting product" });
  }
});


app.get('/api/products/search', (req, res) => {
  const searchQuery = req.query.q.toLowerCase(); // Get the search query from the URL query parameter
  console.log(`Received search query: ${searchQuery}`);
  // Perform the search by filtering products based on name, category, and description
  const searchResults = products.filter((product) => {
    const productName = product.productname.toLowerCase();
    const productCategory = product.category.toLowerCase();
    const productDescription = product.description.toLowerCase();

    return (
      productName.includes(searchQuery) ||
      productCategory.includes(searchQuery) ||
      productDescription.includes(searchQuery)
    );
  });

  res.json(searchResults);
});

app.post("/api/cart/add/:productId", (req, res, next) => {
  const { productId } = req.params;

  try {
    // Decode the JWT token and attach user information to the request
    const decodedToken = jwt.verify(req.headers.authorization.split(" ")[1], jwtSecretKey);
    req.user = {
      id: decodedToken.userId,
      name: decodedToken.name,
      role: decodedToken.role,
    };
    
    // Continue to the next middleware
    next();
  } catch (error) {
    console.error("Error decoding token:", error);
    res.status(401).json({ message: "Unauthorized" });
  }
}, async (req, res) => {
  const { productId } = req.params;
  const userId = req.user.id;

  try {
    // Check if the product is valid
    const productInstance = await product.findByPk(productId);
    if (!productInstance) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Add the product to the user's cart
    await cart.create({ userId, productId });

    res.json({ message: "Product added to cart" });
  } catch (error) {
    console.error("Error adding product to cart:", error);
    res.status(500).json({ message: "Error adding product to cart" });
  }
});


// Route to get user's cart items
app.get("/api/cart", (req, res, next) => {
  try {
    // Decode the JWT token and attach user information to the request
    const decodedToken = jwt.verify(req.headers.authorization.split(" ")[1], jwtSecretKey);
    req.user = {
      id: decodedToken.userId,
      name: decodedToken.name,
      role: decodedToken.role,
    };
    
    // Continue to the next middleware
    next();
  } catch (error) {
    console.error("Error decoding token:", error);
    res.status(401).json({ message: "Unauthorized" });
  }
}, async (req, res) => {
  const userId = req.user.id;

  try {
    const userCartItems = await cart.findAll({
      where: { userId },
      include: [{ model: product, include: [user] }],
    });

    res.json(userCartItems);
  } catch (error) {
    console.error("Error fetching cart items:", error);
    res.status(500).json({ message: "Error fetching cart items" });
  }
});

// Route to remove a product from user's cart
app.delete("/api/cart/remove/:productId", (req, res, next) => {
  const { productId } = req.params;

  try {
    // Check if the authorization header is present
    if (req.headers.authorization) {
      // Decode the JWT token and attach user information to the request
      const decodedToken = jwt.verify(req.headers.authorization.split(" ")[1], jwtSecretKey);
      console.log("Decoded Token:", decodedToken);
      req.user = {
        id: decodedToken.userId,
        name: decodedToken.name,
        role: decodedToken.role,
      };
    }
    
    // Continue to the next middleware
    next();
  } catch (error) {
    console.error("Error decoding token:", error);
    // Don't immediately return an error for missing authorization header
    // Instead, just proceed to the next middleware without attaching user info
    next();
  }
}, async (req, res) => {
  const { productId } = req.params;
  const userId = req.user ? req.user.id : null; // Use user ID if available
  console.log("User ID:", userId);
  try {
    // Remove the product from the user's cart if user info is available
    if (userId) {
      await cart.destroy({ where: { userId, productId } });
      res.json({ message: "Product removed from cart" });
    } else {
      // Handle the case where user info is not available
      res.json({ message: "Product removed from cart (no user info)" });
    }
  } catch (error) {
    console.error("Error removing product from cart:", error);
    res.status(500).json({ message: "Error removing product from cart" });
  }
});





const uploadsDir = path.join(__dirname, "uploads");
cron.schedule("38 12 * * *", async () => {
  try {
    // Get used image filenames from the database
    const usedImages = await product
      .findAll({
        attributes: ["images"],
        raw: true,
      })
      .then((products) => products.map((product) => product.images).flat());

    // Read the directory to get all image filenames
    const allImages = fs.readdirSync(uploadsDir);

    // Determine unused images
    const unusedImages = allImages.filter(
      (image) => !usedImages.some((usedImage) => usedImage.includes(image))
    );

    // Delete unused images
    unusedImages.forEach((image) => {
      const imagePath = path.join(uploadsDir, image);
      fs.unlinkSync(imagePath);
      console.log(`Deleted unused image: ${image}`);
    });
  } catch (error) {
    console.error("Error cleaning images:", error);
  }
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Error:", err);

  if (err instanceof Sequelize.ValidationError) {
    const errors = err.errors.map((error) => ({
      field: error.path,
      message: error.message,
    }));
    res.status(400).json({ errors });
  } else {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = app;
