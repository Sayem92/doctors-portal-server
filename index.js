const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const jwt = require('jsonwebtoken')


const app = express();
const port = process.env.PORT || 5000;

// middle ware--
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.lhckmem.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



async function run() {
    try {
        const appointmentOptionsCollection = client.db("DoctorsPortal").collection("appointmentOptions");

       


        app.get('/appointmentOptions', async (req, res) => {
            const query = {}
            const options = await appointmentOptionsCollection.find(query).toArray();
            res.send(options);
        })






    }
    catch (err) {
        console.log(err);
    }


}

run().catch(err => console.log(err))



app.get('/', (req, res) => {
    res.send('Doctors portal server is running.............')
});

app.listen(port, () => {
    console.log('Doctors portal server running on:', port);
})