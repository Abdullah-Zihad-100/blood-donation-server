require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const stripe = require("stripe")(process.env.SECRET);
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// { https://blood-donation-1-6920a.web.app }
// { http://localhost:5173 }
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());

// middelware-----&gt;

const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Invalid or exprired token" });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASS}@cluster0.hmqrzhm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // collactions----------&gt;
    const donorsCollaction = client.db("Blood-Donation").collection("donors");
    const usersCollaction = client.db("Blood-Donation").collection("users");
    const reviewsCollaction = client.db("Blood-Donation").collection("reviews");
    const paymentInfoCollaction = client
      .db("Blood-Donation")
      .collection("paymentInfo");

    // admin verify
    const verifyAdmin = async (req, res, next) => {
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollaction.findOne(query);
      if (!result || result?.role !== "admin") {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      console.log("User form verifyAdmin:", user);
      next();
    };

    // send email
    const sendEmail = (emailAddress, emailData) => {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
      transporter.verify((error, success) => {
        if (error) {
          console.log(error);
        } else {
          console.log("Server is reday to take our message", success);
        }
      });
      const mailBody = {
        from: process.env.EMAIL_USER,
        to: emailAddress,
        subject: emailData?.subject,
        html: `<p>${emailData?.message}</p>`,
      };
      transporter.sendMail(mailBody, (error, info) => {
        if (error) {
          console.log(error);
        } else {
          console.log("Email sent", +info.response);
        }
      });
    };

    app.post("/sendReq", async (req, res) => {
      const { details } = req.body;
      console.log(details);

      sendEmail(details?.email, {
        subject: "Urgent Blood Donation Request",
        message: `Dear Donor,
 
We hope this email finds you well. We are reaching out to inform you about an urgent need for blood donation and your incredible generosity could save a life.
 
**Patient Name:** ${details?.patientName}  
**Hospital Name:** ${details?.hospitalName}  
**Current Location:** ${details?.currentLocation}  
**Contact Number:** ${details?.contactNumber}
 
Your selfless act of donating blood has the potential to provide a second chance to someone in need. Every drop counts, and your contribution would mean the world to the patient and their loved ones.
 
If you are available to donate, please reach out as soon as possible to the provided contact number or visit the hospital mentioned above. Your prompt response can make a life-saving difference.
 
Thank you for being a beacon of hope and for your continued support in this noble cause.
 
Warm regards,  
**Compact Blood Donation Team**`,
      });
    });

    app.post("/contactDetails", async (req, res) => {
      const { user } = req.body;
      console.log(user);
      sendEmail(process.env.EMAIL_USER, {
        subject: "Try To Contact A User",
        message: `Name: ${user?.name},Email: ${user?.email} , Contact Number: ${user?.contactNumber}`,
      });
      res.send({ message: "Contact details saved successfully!" });
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      console.log(price);
      if (!price || isNaN(price) || price <= 0) {
        return res.status(400).json({ error: "Invalid price value" });
      }

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: price, // Amount must be an integer in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.status(200).json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).json({ error: error.message });
      }
    });

    const isProduction = process.env.NODE_ENV === "production";

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET, { expiresIn: "365d" });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true, // Secure cookies only in production
          sameSite: "none", // Use 'none' in production, 'strict' locally
        })
        .send({ success: true });
    });

    app.get("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    app.get("/users", async (req, res) => {
      const result = await usersCollaction.find().toArray();
      res.send(result);
    });

    // delete user---------&gt;

    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = usersCollaction.deleteOne(query);
      res.send(result);
    });

    // get admin ------&gt;

    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      // console.log(email);
      const result = await usersCollaction.findOne({ email });
      // console.log("Query result", result);
      res.send(result);
    });

    // user save database-----------&gt;
    app.put("/save-user", async (req, res) => {
      const { user, role } = req.body;
      const email = user?.email;
      const query = await usersCollaction.findOne({ email });

      if (query) {
        return res.status(200).json({ message: "User already exists" });
      }
      user.role = role || "role";
      const result = await usersCollaction.insertOne(user);
      return res.send(result);
    });

    // update role users to dantor-----&gt;

    app.patch("/save-as-a-donator", async (req, res) => {
      try {
        const { email } = req.body;

        // Validate email
        if (!email) {
          return res
            .status(400)
            .send({ success: false, message: "Email is required" });
        }

        // Find the user by email
        const user = await usersCollaction.findOne({ email });
        if (!user) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        // Toggle role based on current role
        const newRole = user?.role === "donator" ? "user" : "donator";

        // Update the user's role
        const updateDoc = { $set: { role: newRole } };
        console.log(updateDoc);
        const result = await usersCollaction.updateOne({ email }, updateDoc);

        if (result.modifiedCount === 0) {
          return res
            .status(500)
            .send({ success: false, message: "Failed to update role" });
        }

        res.send({
          success: true,
          message: `Role updated successfully to ${newRole}`,
          newRole,
        });
      } catch (error) {
        console.error("Error toggling role:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // get all users --------&gt;
    app.get("/users", verifyToken, verifyToken, async (req, res) => {
      const result = await usersCollaction.find().toArray();
      res.send(result);
    });

    // get donors-----&gt;
    app.get("/donors", async (req, res) => {
      const result = await donorsCollaction.find().toArray();
      res.send(result);
    });

    // get single donor-------&gt;
    app.get("/donators/details/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await donorsCollaction.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // get for my prfile ------&gt;

    app.get("/profile-donors", async (req, res) => {
      const { email } = req.query;
      if (!email) {
        return res
          .status(400)
          .send({ success: false, message: "Email is required" });
      }
      const result = await donorsCollaction.findOne({ email });
      // Add logic to find the donor by email and respond
      res.send({ success: true, donor: result });
    });

    //  edit profile-----------&gt;

    app.put("/edit-profile/:id", async (req, res) => {
      const id = req.params.id;
      const donorData = req.body.donorData;
      console.log("prfile-Id", id);
      if (!id || !donorData) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid data" });
      }
      try {
        const query = { _id: new ObjectId(id) };
        const updateDoc = { $set: donorData };
        console.log(updateDoc);
        const result = await donorsCollaction.updateOne(query, updateDoc);
        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Donor not found" });
        }
        res.send({ success: true, result });
      } catch (error) {
        console.error("Error updating profile:", error);
        res
          .status(500)
          .send({ success: false, message: "Update failed", error });
      }
    });

    // post a donor
    app.post("/donors", async (req, res) => {
      const donor = req.body;
      const result = await donorsCollaction.insertOne(donor);
      res.send(result);
    });

    // delete donor

    app.delete("/donors/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = donorsCollaction.deleteOne(query);
      res.send(result);
    });

    // update role

    app.put("/update-role/:id", async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: role },
      };
      const result = usersCollaction.updateOne(query, updateDoc);
      console.log(id, role);
      res.send(result);
    });

    // admin state -------&gt;

    // app.get("/admin-state", verifyToken, verifyAdmin, async (req, res) => {
    //   const userCount = await usersCollaction.countDocuments(); // Verify collection name
    //   const donatorCount = await donorsCollaction.countDocuments(); // Verify collection name


    //   const totalAmountPipeline=[
    //     {$group:{_id:null,totalAmount:{$sum:"$amount"}}}
    //   ]
    //   const totalAmountResult=await paymentInfoCollaction.aggregate(totalAmountPipeline).toArray();
    //   const totalAmount=totalAmountResult[0]?.totalAmount || 0;
    //   res.send({ userCount, donatorCount,totalAmount }); //
    // });


    app.get("/admin-state", verifyToken, verifyAdmin, async (req, res) => {
      try {
        // Count total users
        const userCount = await usersCollaction.countDocuments();

        // Count total donors
        const donatorCount = await donorsCollaction.countDocuments();

        // Calculate the total amount from paymentInfoCollaction
       const totalAmountPipeline = [
         {
           $addFields: {
             amountAsNumber: { $toDouble: "$amount" }, // Convert string amount to number
           },
         },
         {
           $group: {
             _id: null,
             totalAmount: { $sum: "$amountAsNumber" },
           },
         },
       ];
        const totalAmountResult = await paymentInfoCollaction
          .aggregate(totalAmountPipeline)
          .toArray();
        const totalAmount = totalAmountResult[0]?.totalAmount || 0; // Default to 0 if no data

        // Send response
        res.send({ userCount, donatorCount, totalAmount });
      } catch (error) {
        console.error("Error fetching admin state:", error);
        res.status(500).send({ error: "Failed to fetch admin state" });
      }
    });



    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollaction.find().toArray();
      res.send(result);
    });

    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollaction.insertOne(review);
      res.send(result);
    });

    // save data base payment
    app.post("/savePaymentInfo", async (req, res) => {
      const { paymentInfo } = req.body;
      const result = await paymentInfoCollaction.insertOne(paymentInfo);
      res.send(result);
    });

    app.get("/paymentInfo", async (req, res) => {
      const result = await paymentInfoCollaction.find().toArray();
      res.send(result);
    });

    app.get("/savePaymentInfo/:email", async (req, res) => {
      const email = req.params.email; // Extract email from params
      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      const result = await paymentInfoCollaction.find({ email }).toArray(); // MongoDB query
      res.send(result);
    });

    // delete reviews

    app.delete("/review/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = reviewsCollaction.deleteOne(query);
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("App is runiing!");
});

// Specific route not found middleware (moved to end)
app.use((req, res, next) => {
  res.status(404).json({
    status: "error",
    message: `Route not found: ${req.originalUrl}`,
    method: req.method,
  });
});

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});
