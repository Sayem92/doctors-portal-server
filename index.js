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

        const bookingsCollection = client.db("DoctorsPortal").collection("bookings");


        // use aggregate to query to multiple collection and then merge data
        app.get('/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const query = {}
            const options = await appointmentOptionsCollection.find(query).toArray();

            // get all bookings of the provider data-----------
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

            // be careful---------------
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
                const bookSlot = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookSlot.includes(slot));
                // console.log(date, option.name, remainingSlots.length);
                option.slots = remainingSlots;
            })
            res.send(options);
        });


        app.get('/v2/appointmentOptions', async (req, res) => {
            const date = req.query.date;
            const options = await appointmentOptionsCollection.aggregate([
                {
                    $lookup: {
                        from: 'bookings',
                        localField: "name",  //main jeta sate melaiba----
                        foreignField: "treatment",  //jake milaiba----
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$appointmentDate', date]
                                    }
                                }
                            }
                        ], // matching ar jonno------
                        as: "booked", // output name---
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: 1,
                        booked: {
                            $map: {
                                input: '$booked',
                                as: 'book',
                                in: '$$book.slot'
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options);

        });
        

        // post bookings-------
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });






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