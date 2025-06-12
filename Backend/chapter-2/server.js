// The  address of the server conncted to the  internet is :
// URL -> https://localhost:8383
// IP -> 127.0.0.1:8383

const express = require('express');
const app = express();
const PORT  = 8383;

let data = [
    {name:'John'},
    {name:'Jane'}
];


// HTTPS VERBS AND ROUTES

//  Type 1 -websites endpoints(tHEY Typically happen when a user enters the url in the browser) 
app.get('/', (req, res) => {
res.send(`
    <body style="background:pink;
    color: blue; "> 
    
    <H1>DATA</H1>
        <p>${JSON.stringify(data)}</p>
    </body>`);
});

app.get ('/dashboard', (req, res) => {
    console.log('yay i hit an / dashboard Endpoint',)
            res.send('<h1>dashboard</h1>');
})

 

//  Type 2- API endpoints(They typically happen when a user clicks a button or submits a form in the browser)(non-visual)

 // CRUD- Method operations- CREATE-Post , READ-get , UPDATE, DELETE
app.get('/api/data', (req, res) => {
    console.log('this is for data');
    res.send(data);
});
 
app.post('/api/data',(req, res) => {
    // someone wants  to create  a user  (for   example when they click a sign up 
    // button)
    // the user clicks  the sign up button after entering their  cridentials , and the browser is wired up to  send out a network request
    // the request is sent to the server, and the server will handle the action
    const newEntry = req.body 
    res.sendStatus(201).send({
        message: 'New entry created',
        data: newEntry
    }); 

     
} )

// middleware to parse JSON body






app.listen(PORT , () =>   
    console.log(`Server is running on http://localhost:${PORT}`))
