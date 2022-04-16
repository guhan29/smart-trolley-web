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
app.use(express.json());
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
  const productsBody = req.body.products;
  const bill = { ...productsBody };
  await firestore.collection('bills').add(bill);
  let products = productsBody.map(p => p.name)
  console.log(products);
  await firestore.collection('transaction').add({products});
  dataset.push(products);
  runApriori();
  // console.log(dataset);
  // console.log(recommendedItems);
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});