const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// email send ar---------
const nodemailer = require("nodemailer");
//nodemailer + mailgun--------
const mg = require('nodemailer-mailgun-transport');

require('dotenv').config();


//  Stripe ar-------
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const jwt = require('jsonwebtoken')

const app = express();
const port = process.env.PORT || 5000;

// middle ware--
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.lhckmem.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function sendBookingEmail(booking) {
    const { email, appointmentDate, treatment, slot } = booking;

    // send nodemail+mailgun----------
    const auth = {
        auth: {
            api_key: process.env.EMAIL_SEND_KEY,
            domain: process.env.EMAIL_SEND_DOMAIN
        }
    }

    const transporter = nodemailer.createTransport(mg(auth));

    //send nodemail di----------------

    // let transporter = nodemailer.createTransport({
    //     host: 'smtp.sendgrid.net',
    //     port: 587,
    //     auth: {
    //         user: "apikey",
    //         pass: process.env.SENDGRID_API_KEY
    //     }
    // });


    console.log('sending email', email);
    // aita olo mail patani all allow----------
    transporter.sendMail({
        from: "sayemmiha123@gmail.com", // verified sender email
        to: email || "sayemmiha123@gmail.com", // recipient email
        subject: `Your appointment for ${treatment} is confirmed `, // Subject line
        text: "Hello world!", // plain text body
        html: `
        <h3>Your appointment is confirmed</h3>
        <div>
            <p>Your appointment for treatment : ${treatment}</p>
            <p>Please visit on us ${appointmentDate} at ${slot}</p>
            <p>Thanks for Doctor Portals.</p>
        </div>
        
        `, // html body
    }, function (error, info) {
        if (error) {
            console.log("sending mail error", error);
        } else {
            console.log('Email sent: ' + info);
        }
    });




}


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized access' })
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' });
        }
        req.decoded = decoded; // req.decoded set korci-------
        next();
    })
};


async function run() {
    try {
        const appointmentOptionsCollection = client.db("DoctorsPortal").collection("appointmentOptions");

        const bookingsCollection = client.db("DoctorsPortal").collection("bookings");

        const usersCollection = client.db("DoctorsPortal").collection("users");

        const doctorsCollection = client.db("DoctorsPortal").collection("doctors");

        const paymentsCollection = client.db("DoctorsPortal").collection("payments");


        //Node: make sure you use verify admin after verify jwtToken
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }

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
                        price: 1,
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
                        price: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options);

        });

        //get appointments name by project query--------
        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {}
            const result = await appointmentOptionsCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);
        });

        // get all booking user----------
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: "forbidden access" })
            }
            const query = { email: email }
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        });

        // get single booking user----------
        app.get("/bookings/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const singleBooking = await bookingsCollection.findOne(query);
            res.send(singleBooking)
        })

        // post bookings-------
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            console.log(booking);
            const query = {
                appointmentDate: booking.appointmentDate,
                email: booking.email,
                treatment: booking.treatment

            }

            const alreadyBooked = await bookingsCollection.find(query).toArray();

            if (alreadyBooked.length) {
                const message = `You already have a booking on : ${booking.appointmentDate}`
                return res.send({ acknowledged: false, message })
            }

            const result = await bookingsCollection.insertOne(booking);

            // send email about appointments confirmation
            sendBookingEmail(booking)

            res.send(result);
        });


        //create jwt---------
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1d' });
                return res.send({ accessToken: token })
            }

            res.status(403).send({ accessToken: 'no token available' })

        });

        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;  // poysa the change korbo

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ],
            })

            res.send({
                clientSecret: paymentIntent.client_secret,
            });

        });

        // save user payment data ---------
        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentsCollection.insertOne(payment);

            const id = payment.bookingId;
            const filter = { _id: ObjectId(id) }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                }
            }
            const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc)
            res.send(result)
        });

        //post users-----------
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        //get all users---------------
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        // get admin user-----
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        });

        // update user-----------
        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            // const decodedEmail = req.decoded.email;
            // const query = { email: decodedEmail };
            // const user = await usersCollection.findOne(query);

            // if (user?.role !== 'admin') {
            //     return res.status(403).send({ message: 'forbidden access' })
            // }

            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result)
        });

        //temporary update a single property of collection-----------
        // app.get('/addPrice', async (req, res) => {
        //     const filter = {}
        //     const options = { upsert: true }
        //     const updatedDoc = {
        //         $set: {
        //             price: 99
        //         }
        //     }
        //     const result = await appointmentOptionsCollection.updateMany(filter, updatedDoc, options);
        //     res.send(result)
        // })


        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor)
            res.send(result)

        });

        // get all doctors info ---------
        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {}
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        });


        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const result = await doctorsCollection.deleteOne(query);
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