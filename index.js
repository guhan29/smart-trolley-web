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

app.get('/', async (req, res) => {
  let sendHtm = `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link
        rel="stylesheet"
        href="https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/css/bootstrap.min.css"
      />
      <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
      <script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.4.1/js/bootstrap.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.5.0/Chart.min.js"></script>
    <title>Smart Trolley</title>
  </head>
  <body>
    <div class="container">
      <canvas id="myChart" style="width:100%;max-width:800px"></canvas>
    </div>
    <script>
      var data = [];

      fetch('http://localhost:8080/bills/all')
      .then(res => res.json())
      .then(d => {
        data = d;
        return d;
      })
      .then(d => plotGraph())
      .catch(err => console.log(err));



      var pFreq = {};
      var xValues = [];
      var yValues = [];
      var barColors = ["red", "green","blue","orange","brown"];

      function plotGraph() {
        for(let i=0; i<data.length; i++) {
          let bill = data[i];
          // console.log(bill.products);
          for (let j=0; j<bill.products.length; j++) {
            let name = bill.products[j].name;
            let qty = bill.products[j].quantity;
            // console.log(name, qty);
            // console.log(pFreq[name]);
            if (pFreq[name] == undefined) {
              pFreq[name] = qty;
            } else {
              pFreq[name] += qty;
            }
          }
        }

        for (const key in pFreq) {
          xValues.push(key);
          yValues.push(pFreq[key])
        }



        new Chart("myChart", {
          type: "bar",
          data: {
            labels: xValues,
            datasets: [{
              backgroundColor: barColors,
              data: yValues
            }]
          },
          options: {
            legend: {display: false},
            title: {
              display: true,
              text: "Frequently bought products"
            },
            scales: {
              yAxes: [{
                display: true,
                ticks: {
                  beginAtZero: true
                }
              }]
            }
          }
        });
      }
    </script>
  </body>
  </html>
  `;

  res.send(sendHtm);
});

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
