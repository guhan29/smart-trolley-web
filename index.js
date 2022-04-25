const firebase = require('firebase-admin');
const serviceAccount = require('./iot-smarttrolley-firebase-adminsdk-xyc6m-79965b3496.json');
firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: "https://iot-smarttrolley-default-rtdb.firebaseio.com/"
});

const aprioriLib = require("node-apriori/dist/apriori");
const express = require('express');
const app = express();
const cors = require('cors');
const e = require('express');
const stripe = require("stripe")("sk_test_51KsOL5SJf20SChmkao7zZJ7XurGulNPK8mJULF3uPpArG4DXKgtZ1Vwi4KK0ofJ7ZZyqRSRG8oTYRhoM6UlkSmBE001IA8u2o3");
app.use(express.json());
app.use(express.static('public'));
app.use(cors());
/*
const db = firebase.database();
const ref = db.ref('restricted_access/secret_document');
ref.once('value', (snapshot) => {
  console.log(snapshot.val());
});

var usersRef = ref.child("users");
usersRef.set({
  alanisawesome: {
    date_of_birth: "June 23, 1912",
    full_name: "Alan Turing"
  },
  gracehop: {
    date_of_birth: "December 9, 1906",
    full_name: "Grace Hopper"
  }
});
*/

const firestore = firebase.firestore();
var settings = { timestampsInSnapshots: true };
firestore.settings(settings);

var dataset = [
  ['Bread', 'Butter', 'Jam'],
  ['Bread', 'Jam'],
  ['Milk', 'Biscuit'],
  ['Bread', 'Butter', 'Milk'],
  ['Bread', 'Butter', 'Apple'],
  ['Apple', 'Milk', 'Bread'],
  ['Apple', 'Bread', 'Milk'],
  ['Bread', 'Butter', 'Milk']
];

var recommendedItems =  {};

// Apriori Algorithm
var apriori = new aprioriLib.Apriori(.4);

apriori.on('data', function (itemset) {
  // Do something with the frequent itemset.
  var support = itemset.support;
  var items = itemset.items;

  let len = items.length;
  for (let i=0; i<len; i++) {
    for (let j=0; j<len; j++) {
      if (recommendedItems[items[i]] == undefined) {
        recommendedItems[items[i]] = new Set();
      } else if (i != j) {
        recommendedItems[items[i]].add(items[j]);
      }
    }
  }

  console.log(`Itemset { ${items.join(',')} } is frequent and have a support of ${support}`);
});

function runApriori() {
  // Execute Apriori on a given set of transactions.
  apriori.exec(dataset)
  .then(function (result) {
    // Returns both the collection of frequent itemsets and execution time in millisecond.
    var frequentItemsets = result.itemsets;
    var executionTime = result.executionTime;
    // console.log(frequentItemsets);
    console.log(`Finished executing Apriori. ${frequentItemsets.length} frequent itemsets were found in ${executionTime}ms.`);
  });
}

async function getAllFromStore() {
  const snapshot = await firestore.collection('transaction').get();
  snapshot.forEach((doc) => {
    let id = doc.id;
    let data = doc.data();

    dataset.push([ ...data.products ]);
  });
  console.log(dataset);
  recommendedItems = {};
  await runApriori();
  console.log(recommendedItems);
}

getAllFromStore();

app.post('/checkout-products', async (req, res) => {
  const products = req.body;
  console.log(products);
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: req.body.products.map(item => {
        return {
          price_data: {
            currency: "INR",
            product_data: {
              name: item.name,
            },
            unit_amount: item.price*100,
          },
          quantity: item.quantity,
        }
      }),
      // TODO: Change here
      success_url: `http://iot-smart-trolley-347413.de.r.appspot.com/success.html`,
      cancel_url: `http://iot-smart-trolley-347413.de.r.appspot.com/cancel.html`,
    })
    res.json({ url: session.url });

  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/recommend/:product', async (req, res) => {
  let product = req.params.product;
  console.log(product);
  let rProducts = [];
  if (recommendedItems[product] != undefined) {
    await recommendedItems[product].forEach(item => rProducts.push(item));
  }
  console.log(rProducts);
  res.status(200).send(rProducts.join(', '));
});

app.post('/transaction', async (req, res) => {
  const createdAt = new Date();
  const productsBody = req.body.products;
  const bill = { products: [...productsBody], createdAt: createdAt };
  await firestore.collection('bills').add(bill);
  let products = productsBody.map(p => p.name)
  console.log(products);
  await firestore.collection('transaction').add({products, createdAt: createdAt});
  dataset.push(products);
  runApriori();
  res.status(201).end();
});

app.get('/transaction/all', async (req, res) => {
  const snapshot = await firestore.collection('transaction').get();

  let transactions = [];
  snapshot.forEach((doc) => {
    let id = doc.id;
    let data = doc.data();

    transactions.push({ id, ...data });
  });

  res.status(200).json(transactions);
});

app.get('/bills/all', async (req, res) => {
  const snapshot = await firestore.collection('bills').get();

  let bills = [];
  snapshot.forEach((doc) => {
    let id = doc.id;
    let createdAt = doc.createdAt;
    let data = doc.data();

    bills.push({ id, createdAt, ...data });
  });

  res.status(200).json(bills);
});

// const PORT = process.env.PORT || 5000;
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});
