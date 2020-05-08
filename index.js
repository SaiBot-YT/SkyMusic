var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var express = require("express");
//var cron = require("node-cron")
var nodemailer = require('nodemailer');
var hash = require('sha1')
//-----------------------------//
var app = express();
var mongoKey = process.env.mongoDBKey
// mongoKey = ""
var awaitingVerification = []
var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'thoseskymodders@gmail.com',
      pass: process.env.pass
    }
  });
//



//
app.use(express.static('public'));
var bodyParser = require('body-parser');
app.use(bodyParser.json());
var port = process.env.PORT || 8080
setInterval(() => { //to replace with node-cron once i figure out what causes the problem
    removeUnusedVerification()
}, 60000);
 function removeUnusedVerification(){
    for(let i=0;i<awaitingVerification.length;i++){
        awaitingVerification[i].timesChecked ++
        if(awaitingVerification[i].timesChecked > 5){
            console.log("deleted verification by: "+awaitingVerification[i].email)
             awaitingVerification.splice(i,1)
              i--
        }
    }
 }
MongoClient.connect(mongoKey,  function(err, db1) {
    if (err) throw err;
    const db = db1.db("skyMusic");
    const emailDb = db1.db("emailDb");
//----------------------------------------------------------------------------------------------//
    app.get("/",function(req, res) {
        res.sendFile(__dirname+"/index.html")
    })
//----------------------------------------------------------------------------------------------//
app.post("/createAccount", async function(req, res) { //error is handled
    var canProceed = true;
    var value = req.body;
    try{
    value.email = value.email.toLowerCase()
    if(value.password.length < 5){//checks lenght of password
        res.send("Password must be minimum 5 characters")
        canProceed = false;
        return;
    }
    if(!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value.email)){ //check validity of email
        res.send("Invalid email")
        canProceed = false;
        return;
    }
    if(value.email.includes("$")){//checks validity of email
        res.send("Invalid email, it must not contain a $")
        return;
    }
    }catch(e){
        res.send("Error in credentials!")
        console.log(e)
        canProceed = false;
    }
    try{
        var savedEmails = await db.listCollections().toArray()
    }catch{
        res.send("Error while creating the account")
        canProceed = false;
    }
    try{
        for(let i=0;i<savedEmails.length;i++){
            //DOESNT WORK, TO FIX
            if(savedEmails[i].name == value.email){//checks if someone already registered with that mail
                res.send("This email is already in use")
                canProceed = false;
                break;
            }
        }
        for(let i=0;i<awaitingVerification.length;i++){ //if there is already a request pending from this mail
            if(awaitingVerification[i].email == value.email){
                res.send("You have a pending verification, try again in 5 minutes") //request already existing
                canProceed = false;
                break;
            }
        }
    }catch(e){
        res.send("Error!")
        console.log(e)
        canProceed = false;
        return;
    }
    if(canProceed) sendVerificationCode(value,res) //sent verification, now it waits for next call from the user to verify the account
})
//----------------------------------------------------------------------------------------------//
    app.post("/verifyAccount", async function(req,res) { //error is handled
        var value = req.body;
        let canProceed = false;
        var credentials;
        try{
            for(let i=0;i<awaitingVerification.length;i++){
                if(awaitingVerification[i].email == value.email){ //if there is a pending acceptation from this email
                    if(awaitingVerification[i].code == value.code){ //if the code is correct
                        credentials = awaitingVerification[i]
                        awaitingVerification.splice(i,1)
                        canProceed = true;
                        break;
                    }
                }
            }
        }catch(e){
            res.send("Error!")
            console.log(e)
            return;
        }
        if(canProceed){
            try{
                console.log("Created account with name: "+credentials.email)
                await db.createCollection(credentials.email).catch()
                var collection = db.collection(credentials.email)
                var finalhash = hash(hashwithseed(credentials.password))
                if(finalhash != null){
                await collection.insertOne({_id:0, email: credentials.email, password: finalhash})
                }
            }catch{}
            res.send(true)
        }else{
            res.send("The code is not correct, try again!")
        }
    })
//----------------------------------------------------------------------------------------------//
app.post("/login", async function(req,res) { //error handles
    var value = req.body;
    //checks email length
    try{
        if(value.email.length > 64 || value.password.length > 128 || value.password.length < 5) {
            console.log("Invalid email or password length. Attempted username or password length : "+value.email.length+":"+value.password.length)
            res.send("Invalid credentials")
            return;
        } 
        if(!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(value.email)){
            console.log("Invalid email")
            res.send("Invalid email")
            return;
        }    
    }catch(e){
        res.send("Error!")
        console.log(e)
        return;
    }   
    try{
        var users = await db.listCollections().toArray()
    }catch{
        res.send("Error trying to Login!")
        return
    }
    var userExists = false
    for(let i=0;i<users.length;i++){
        if(users[i].name == value.email){ //checks if the username exists
            userExists = true;
            break;
        }
    }
    if(userExists){
        try{
            var collection = db.collection(value.email)
            var credentials = await collection.find({_id: 0}).toArray()
        }catch{
            res.send("Credentials wrong!")
            return;
        }
        try{
            if(checkPassword(value.password,credentials[0].password)){
                console.log("login done by: "+value.email)
                res.send(true)
            }else{
                console.log("Failed login by: "+value.email)
                res.send("Credentials wrong!")
            }
        }catch(e){
            res.send("Credentials wrong!")
            console.log(e)
        }
    }else{
        console.log("User: "+value.email+" doesn't exist!")
        res.send("Credentials wrong!")
    }
})
//----------------------------------------------------------------------------------------------//
    app.post("/getSongs", async function(req,res) { //error handled
        var value = req.body;
        try{
            var collection = db.collection(value.email)
            var credentials = await collection.find({_id: 0}).toArray()
        }catch{
            res.send("Error with the server!")
            console.log("error with the server")
            return
        }
        if(credentials == undefined){
            res.send("Credentials wrong")
            console.log("credentials wrong")
            return;
        }
        try{
            if(checkPassword(value.password,credentials[0].password)){
                var allSongs = await collection.find().toArray()
                    allSongs.splice(0,1) //removes the credentials
                var songsToSend = []
                    for(var i=0;i<allSongs.length;i++){
                        songsToSend.push(allSongs[i].song)
                    }
                    res.send(songsToSend)
                    console.log("songs sent to: "+value.email)
            }else{
                res.send("Credentials are wrong!")
            }
        }catch(e){
            res.send("Error!")
            console.log(e)
        }
    })
//----------------------------------------------------------------------------------------------//
    app.post("/saveSongs", async function(req,res) {
        var value = req.body;
        try{
            var collection = db.collection(value.email)
            var credentials = await collection.find({_id: 0}).toArray()
        }catch(e){
            res.send("Error with the account!"+e)
            return;
        }
        if(credentials == undefined){
            res.send("Credentials wrong")
            return;
        }
        console.log("limit the amount of songs u can store")
        var alreadySavedSongs = ""
        try{
            if(checkPassword(value.password,credentials[0].password)){
                for(var i=0; i<value.song.length;i++){
                    var isSongSaved = await collection.find({name: value.song[i].name}).toArray()
                    if(isSongSaved.length == 0){
                      await collection.insertOne({song: value.song[i], name: value.song[i].name})
                    }else{
                        alreadySavedSongs += "\n"+value.song[i].name + " was already saved"
                    }
                }   
                    res.send("added songs!" + alreadySavedSongs)
                    console.log("added songs!" + alreadySavedSongs)
            }else{
                res.send("Credentials are wrong!")
            }
        }catch(e){
            res.send("Error!")
        }
    })
//----------------------------------------------------------------------------------------------//
app.post("/deleteSong", async function(req,res) { //error handled
    var value = req.body;
    try{
        var collection = db.collection(value.email)
        var credentials = await collection.find({_id: 0}).toArray()
    }catch{
        res.send("Error with the server!")
        console.log("error with the server")
        return
    }
    if(credentials == undefined){
        res.send("Credentials wrong")
        console.log("credentials wrong")
        return;
    }
    try{
        if(checkPassword(value.password,credentials[0].password)){
          await collection.deleteOne({name: value.songName})
        }else{
            res.send("Credentials are wrong!")
            return;
        }
        }catch{
            res.send("Error!")
            return;
        }
        res.send("Song :"+value.songName+" deleted!")
        console.log("song deleted")
})

    var server = app.listen(port, () => {
    console.log("server is running on port", server.address().port);
    });
});
//----------------------------------------------------------------------------------------------//
//----------------------------------------------------------------------------------------------//
function sendVerificationCode(credentials,res){ //error handled
    let verificationCode = ""
    for(var i=0;i<6;i++){
        verificationCode += Math.floor(Math.random()*9)
    }
    try{
        let verificationObj = {
            email: credentials.email,
            password: credentials.password,
            code: verificationCode,
            timesChecked : 0
        }
    var mailOptions = {
        from: 'thoseskymodders@gmail.com',
        to: credentials.email,
        subject: 'Verification',
        html: '<center><h1>Your code is: <font style="color: rgba(22, 22, 22, 0.65);">'
            +verificationCode
            +'</font></h1></center>'
      };
        transporter.sendMail(mailOptions, function(error, info){
        if (error) {
          console.log("Error in sending email");
          res.send("Error!")
        } else {
          console.log('Email sent: ' + info.response);
          awaitingVerification.push(verificationObj)
          res.send(true)
          console.log(awaitingVerification)
        }
      });
    }catch(e){
        res.send("Error!")
        return;
    }
}
function hashwithseed(string) {
    var increment = 3;
    var input = "5zawL9hxo6m6fFbhJ2zN" + string;
    var output = "";
    try{
    while (increment < input.length) {
      if (increment % 2 == 0) {
        var output = output + input.charAt(increment);
      } else {
        var output = input.charAt(increment) + output;
      }
      increment++;
    }
    return output;
    }catch(e){
        console.log(e)
        return false
    }
  }
  function checkPassword(password,DBpassword){
    try{
        var inputwithseed = hash(hashwithseed(password))
        if(DBpassword == inputwithseed){
            return true;
        }else{
            return false;
        }
    }catch(e){
        console.log(e)
        return false
    }
  }