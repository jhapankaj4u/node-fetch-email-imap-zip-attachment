var Imap = require("imap");
var MailParser = require("mailparser").simpleParser;
const moment = require('moment')
const fs = require('fs');
const configs = require('./configuration')
const AdmZip = require("adm-zip");
const config = require('./app/_helpers/config');

async function zipDirectory(source,out) {
  return new Promise(async (resolve, reject) => {
    try{
      const zip = new AdmZip();
      const outputFile = out;
      zip.addLocalFolder(source);
      zip.writeZip(outputFile);
      return resolve('done')  
    }catch(e){      
      return reject(e)  
    }

  }); 
}


execute = function (nimap) {
  return new Promise((resolve, reject) => {
    var dated = moment(new Date()).format('MMM DD, YYYY');

    var emaildata = []
    nimap.search([
      //['UNSEEN'],
      ['SINCE', dated]
      //,['BEFORE',moment(new Date('2022-02-22')).format('MMM DD, YYYY')]

    ], function (err, results) {
      if (err) {
        console.error('search err', err);
        return reject({
          status: false,
          error: err
        })
      }
      if (!results || !results.length) {
        // console.log("No unread mails");
        nimap.end();
        return resolve({
          status: false,
          error: "No unread mails"
        })
      }
      var f = nimap.fetch(results, {
        bodies: "",
        struct: true,
        markSeen: false
      });
      f.on("message", function (msg, seqno) {

        processMessage(msg, seqno).then(
          success => {

            //console.log(success.data)
            emaildata.push(success)
            if (results.length == emaildata.length) {
              return resolve(emaildata)
            }
            //
          }, errors => {
            emaildata.push(errors)
            if (results.length == emaildata.length) {
              return resolve(emaildata)
            }

          }
        )

      });
      f.once("error", function (err) {
        // console.log('fonerr', err)
        return resolve(err)
      });
      f.once("end", function () {

        // console.log("Done fetching all unseen messages.");
        nimap.end();

      });
    })

  })

}


function processMessage(msg, seqno) {

  return new Promise((resolve, reject) => {

     console.log("Processing msg #" + seqno);

    var buffer = '';
    msg.on("body", function (stream, info) {
      stream.on("data", function (chunk) {
        buffer += chunk.toString('utf8');
      });

      msg.once("end", function () {

        MailParser(buffer, {})
          .then(parsed => {

            //console.log(parsed)

            return resolve({
              status: true,
              data: parsed,
              newh: Imap.parseHeader(buffer)

            })
          })
          .catch(err => {

            // console.log(err);
            return reject({
              status: false,

            })

          });

      });


    });


  })
}


callEmail = async function (email, pass, host) {
  
  return new Promise(async (resolve, reject) => {
    var hostarr = host.split(':')

    var imapConfig={
      user: email,
      password: pass,
      host: hostarr[0],
      port: (hostarr.length > 1 && hostarr[1]) ? hostarr[1] : '993',
      tls: true,
      connTimeout:10000*100,
      authTimeout:5000*100
    }

    if(hostarr[0].indexOf('gmail.com') > -1){
      imapConfig['tlsOptions']={
        rejectUnauthorized: false
      }
    }
    const imap = new Imap(imapConfig)


    imap.once("ready", function () {

      // console.log('ready')
      imap.openBox("INBOX", false, function (err, box) {
        execute(box, imap).then(d => {
          return resolve(d)
        }, async e => {
          reject(e)
        })

      })

    });

    imap.on('error', async function (had_error) {
           reject(had_error)
    });
    imap.connect()

  })

}

saveFiles = async function (svfile, dirname) {
  return new Promise((resolve, reject) => {
    //console.log('ccccccc',svfile)
   //if(svfile.filename){
      var genFname = dirname + '/' + svfile.filename.replace(" ", '').replace(/'/g, '')
      let path = configs.attachmentURL + 'email_attachments/' + genFname
      let buffer = svfile['content'];
      // console.log('writing file', svfile.filename.replace(" ", '').replace(/'/g, ''))
      fs.open(path, 'w', function (err, fd) {
        if (err) {
          // console.log('Error in open file ', err.message)
          svfile.content = 'Error : ' + (err.message.replace(/'/g, ''))
          return resolve(svfile)
        }
  
        // write the contents of the buffer, from position 0 to the end, to the file descriptor returned in opening our file
        fs.write(fd, buffer, 0, buffer.length, null, async function (err) {
          if (err) {
            // console.log('Error in write file', err)
  
            svfile.content = 'Error : ' + err.message.replace(/'/g, '')
            return resolve(svfile)
          }
          fs.close(fd, function () {
            svfile.content = genFname
            return resolve(svfile)
  
          });
        });
      })
    
   // }else{
   //   return resolve(svfile)
   // }
  })

}

generateOnlySql = async function (data, customer_id, dataBrand, imgArr = [], fileProcess) {
  return new Promise((resolve, reject) => {


    var dFrom = JSON.stringify(data.from.value)
    var dTo = JSON.stringify(data.to.value)
    if(dFrom) dFrom=dFrom.replace(/'/g, "\\'")
    if(dTo) dTo=dTo.replace(/'/g, "\\'")
    var dateIns = moment.utc(new Date(data.date)).format('YYYY-MM-DD HH:mm:ss')
    //var scrptxt = (data.html) ? data.html.replace(/\n/g, "").replace("' +", '').replace(/'/g, "\\'") : ''
    var scrptxt = (data.html) ? data.html.replace(/'/g, "\\'") : ((data.textAsHtml) ? data.textAsHtml.replace(/\n/g, "").replace("' +", '').replace(/'/g, "\\'") :"");
    
    // var htmlony = (data.text) ? data.text.replace(/'/g, "\\'") : ''
    var htmlstr = (data.textAsHtml) ? data.textAsHtml.replace(/\n/g, "").replace("' +", '').replace(/'/g, "\\'").trim().substring(0, 200) : ''

    if (scrptxt) {
      htmlony = scrptxt.replace(/<style.*?<\/style>/g, '').replace(/(<([^>]+)>)/gi, "").replace(/&nbsp;/gi, "").trim().substring(0, 200)
    }

    if (htmlstr.trim() == "") {
      htmlony = scrptxt.replace(/<style.*?<\/style>/g, '').replace(/(<([^>]+)>)/gi, "").replace(/&nbsp;/gi, "").trim().substring(0, 200)
    }
    var refrences = (data.references) ? data.references : ''
    //console.log(refrences,'==================',Array.isArray(refrences))
    if (!Array.isArray(refrences)) refrences = [refrences]
    //console.log(refrences,'==================')
    var replyTO = (data.inReplyTo) ? data.inReplyTo : ''

    var subject = (data.subject) ? data.subject.replace(/'/g, "\\'") : "No subject"
    
    if (customer_id) {
      var sqlTxt = `( '${customer_id}','${dataBrand.id}','${dataBrand.id}','${data.messageId}','${dTo}','${dFrom}','${subject}',null,null,null,'${data.date}','${JSON.stringify(imgArr)}','${dateIns}','${replyTO}','${refrences}' )   ,`
    } else {
      // var scrptxt = data.html.replace(/\n/g, "").replace("' +", '').replace("'", '')
      var sqlTxt = `( null,'${dataBrand.id}','${dataBrand.id}','${data.messageId}','${dTo}','${dFrom}','${subject}',null,null,null,'${data.date}','${JSON.stringify(imgArr)}','${dateIns}','${replyTO}','${refrences}' )   ,`
    }
    
    
    return resolve([sqlTxt, fileProcess,[{messageId:data.messageId,msgBody:scrptxt}]])

  })


}

generateSql = async function (data, customer_id, dataBrand) {
  return new Promise(async (resolve, reject) => {
    var fileProcess = [0, 0]

    if (data.attachments.length == 0) {
      // console.log('No attachment')
      var genData = await generateOnlySql(data, customer_id, dataBrand, [], fileProcess);
      return resolve(genData)
    } else {

      //console.log('attachent')
      var promises = []
      var dirname = data.messageId.substring(1, data.messageId.length - 1);
      dirname=dirname.replace(/\//g,'_SLASHES_');
      //var oldmask = process.umask(0);
      var dataNew = data
      var creationFile=0
      try {
       var ckfile= await fs.existsSync(configs.attachmentURL + 'email_attachments/' + dirname);
       //console.log('ckfile ',dirname,ckfile)
       if(ckfile){
        var imgAlreadyArr = []
        dataNew.attachments.forEach(svfile => {
          fileProcess[0] += 1
          //fileProcess[1] += 1
          delete svfile.headers
          delete svfile.partId
          delete svfile.release
          delete svfile.contentId
          delete svfile.checksum
          if(svfile.filename){
            svfile.content = dirname + '/' + svfile.filename.replace(" ", '').replace(/'/g, '')
            imgAlreadyArr.push(svfile)
          }
          
        })
        // console.log('Calling email img already exist.....')
        var dataNew2 = await this.generateOnlySql(dataNew, customer_id, dataBrand, imgAlreadyArr, fileProcess)
        
        return resolve(dataNew2)

       }else{
        creationFile=1
       }


      } catch (err) {

        // console.log('existsync',err)
        creationFile=1
      }

      if(creationFile==1){

        // console.log('Creating File')

        try {
          await fs.mkdirSync(configs.attachmentURL + 'email_attachments/' + dirname, {
            recursive: true
          })
        } catch (err) {
          // console.log('mkdir',err)
          return resolve('', [0, 0])
        }

        try {
          await fs.chmodSync(configs.attachmentURL + 'email_attachments/' + dirname, '0777');//.catch(() => null)
        } catch (exp) {
          // console.log(exp)
          return resolve('', [0, 0])
        }

        // console.log('============ SAVING START FOR FILE =============')
        dataNew.attachments.forEach(svfile => {
          console.log(svfile)
          fileProcess[0] += 1
          if(svfile['contentType'] && svfile['contentType']!='text/calendar' && svfile['filename'])
             promises.push(saveFiles(svfile, dirname))
        })

        var imagesProm = await Promise.all(promises);
        var imgArr = []
        // console.log(imagesProm, 'New imagesProm')
        imagesProm.forEach(e => {
          if (e.content.substring(0, 5) != 'Error') fileProcess[1] += 1
          //console.log(e)
          delete e.headers
          delete e.partId
          delete e.release
          delete e.contentId
          delete e.checksum
          imgArr.push(e)
        })

        // console.log('============ SAVING START FOR ZIP =============')
        zipDirectory(configs.attachmentURL + 'email_attachments/' + dirname, configs.attachmentURL + 'email_attachments/ZIP/' + dirname + '.zip', 9).then(async ndt => {
          // console.log(ndt)
          var genData = await generateOnlySql(dataNew, customer_id, dataBrand, imgArr, fileProcess);
          return resolve(genData)
        }, async e => {
          var genData = await generateOnlySql(dataNew, customer_id, dataBrand, imgArr, fileProcess);
          return resolve(genData)
        })
      }
    }

  })
}


main = async function (email, pwd, host) {
  
  let data = callEmail(email, pwd, host);

  // create query to insert into db
}

main('youremail@gmail.com','password','smtp.gmail.com')






