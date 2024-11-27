require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 5000;
// const jwt = require("jsonwebtoken");

app.use(
  cors({
    origin: "http://localhost:5173", // Frontend origin
    credentials: true,
  })
);app.use(cookieParser());
app.use(express.json());

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
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // collactions---------->
    const donorsCollaction = client.db("Blood-Donation").collection("donors");

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // get donors----->
    app.get("/donors", async (req, res) => {
      const result = await donorsCollaction.find().toArray();
      res.send(result);
    });

    // get single donor------->


    app.get("/donors/:id",async(req,res)=>{
      const id=req.params.id;
      const result = await donorsCollaction.findOne({ _id: new ObjectId(id) });
      res.send(result);
    })

    // post a donor
    app.post("/donors", async (req, res) => {
      const donor = req.body;
      const result = await donorsCollaction.insertOne(donor);
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

app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});
