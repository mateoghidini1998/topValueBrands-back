var reqReports=[];
/** Function to Get Amaozn Listings */
function GetFBAInventory(){  
  CreateReport("GET_FBA_MYI_ALL_INVENTORY_DATA", "FBA",'1034046019532')  
  var data = ReadAndWriteReports() 

}

/** FUNCTION TO GET LISTING REPORT FROM SP-API (AMAZON) */
function CreateReport(rptType, rptId=""){  
  if (Validate()==true)
  {   
    var reqparam = {"reportType": rptType,"marketplaceIds":[MktID], "reportOptions": {"custom":"true"} };    
    console.log(JSON.stringify(reqparam))
    if(rptId==""){
      //Call API with provided query
      var apiResponse = Amazon_SP_API_Service("POST","/reports/2021-06-30/reports","",JSON.stringify(reqparam));
      console.log(apiResponse.getResponseCode())
      // console.log(apiResponse.getContentText())
      if(apiResponse.getResponseCode()==202 || apiResponse.getResponseCode()==200){
        var js = JSON.parse(apiResponse); 
        Logger.log(apiResponse)
        rptId = js.reportId; 
      }else{
        Browser.msgBox(JSON.parse(apiResponse).errors[0].message)
      }
    }
    reqReports.push([ rptType, rptId, mktName]);
  }
}

/** Function to Read Amazon Reports IDs and Write data in AmazonListing Sheet */
function ReadAndWriteReports(){
  if(reqReports.length>0 && Validate()==true){
    // console.log('Total Reports ', reqReports.length)
    for(var i in reqReports){
      var rptId = reqReports[i][1];
      var rptMktName = reqReports[i][2];
      if(rptId!="" && rptMktName==mktName){
        var data =GetReportIDData(rptId);        
        if(data!="" || data.length>0){          
          data = Utilities.parseCsv(data.replace(/["']/g, ""), '\t');  
          // console.log(data)
          data = data.splice(1)
          var needColumns = [2,3];
          data = data.map(function(row) {return needColumns.map(function(col) {return row[col]})}); 
          // data = data.splice(400)
          return data;          
        }
        return data;
      }     
    }
  }
}

/** FUNCTION TO GET INVENTORY REPORT FROM SP-API (AMAZON) */
function GetReportIDData(rptId){  
  
  //Check the report status and get report Document ID
  apiResponse = Amazon_SP_API_Service("GET","/reports/2021-06-30/reports/"+rptId,"","");
  Logger.log(apiResponse)
  js = JSON.parse(apiResponse)
  if(js.errors){
    Browser.msgBox(js.errors[0].message)
    return [];
  }

  if(js.reportType){

    var rptStatus = js.processingStatus;                
    
    while (rptStatus!="DONE") {
      Utilities.sleep(5000); //wait for again 5 seconds to change the report status
      apiResponse = Amazon_SP_API_Service("GET","/reports/2021-06-30/reports/"+rptId,"","");
      Logger.log(apiResponse)
      js = JSON.parse(apiResponse)
      var rptStatus = js.processingStatus;
      if(rptStatus=="FATAL" || rptStatus=="CANCELLED"){
        break;
      }
    }

    if(rptStatus=="DONE") {       
      var rptDocID = js.reportDocumentId
      apiResponse = Amazon_SP_API_Service("GET","/reports/2021-06-30/documents/"+rptDocID,"",""); 
      // Logger.log(apiResponse)
      js = JSON.parse(apiResponse)      
      if(js.url){
        var url =js.url;
        console.log(url)
        var resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
        if(js.compressionAlgorithm){ 
          try{           
            var unzipped = Utilities.ungzip(resp.getBlob().setContentType('application/x-gzip'));       
            var resp = unzipped.getDataAsString("windows-1252")
          }catch(e){
            resp = resp.getContentText("windows-1252");
          }
        }else {
          resp = resp.getContentText("windows-1252");
        }    
        return resp;    
      }     
    }else{
      return ""
    } 
  } 
}

function GetReports(){  
  var reqparam = {"reportType": "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2","marketplaceIds":[MktID] };    
    console.log(JSON.stringify(reqparam))
  //Check the report status and get report Document ID
  apiResponse = Amazon_SP_API_Service("GET","/reports/2021-06-30/reports","",JSON.stringify(reqparam));
  Logger.log(apiResponse)
  js = JSON.parse(apiResponse)
  Logger.log(js)
  if(js.errors){
    Browser.msgBox(js.errors[0].message)
    return [];
  }
  return;
  if(js.reportType){

    var rptStatus = js.processingStatus;                
    
    while (rptStatus!="DONE") {
      Utilities.sleep(5000); //wait for again 5 seconds to change the report status
      apiResponse = Amazon_SP_API_Service("GET","/reports/2021-06-30/reports/"+rptId,"","");
      Logger.log(apiResponse)
      js = JSON.parse(apiResponse)
      var rptStatus = js.processingStatus;
      if(rptStatus=="FATAL" || rptStatus=="CANCELLED"){
        break;
      }
    }

    if(rptStatus=="DONE") {       
      var rptDocID = js.reportDocumentId
      apiResponse = Amazon_SP_API_Service("GET","/reports/2021-06-30/documents/"+rptDocID,"",""); 
      // Logger.log(apiResponse)
      js = JSON.parse(apiResponse)      
      if(js.url){
        var url =js.url;
        console.log(url)
        var resp = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
        if(js.compressionAlgorithm){ 
          try{           
            var unzipped = Utilities.ungzip(resp.getBlob().setContentType('application/x-gzip'));       
            var resp = unzipped.getDataAsString("windows-1252")
          }catch(e){
            resp = resp.getContentText("windows-1252");
          }
        }else {
          resp = resp.getContentText("windows-1252");
        }    
        return resp;    
      }     
    }else{
      return ""
    } 
  } 
}