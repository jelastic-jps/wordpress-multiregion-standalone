import com.hivext.api.Response;
import org.yaml.snakeyaml.Yaml;
import com.hivext.api.core.utils.Transport;

var cdnAppid = "c05ffa5b45628a2a0c95467ebca8a0b4";
var group = jelastic.billing.account.GetAccount(appid, session);
if (group.result != 0) return group;
var isCDN = jelastic.dev.apps.GetApp(cdnAppid);
if (isCDN.result != 0) return isCDN;

var markup = "", cur = null, text = "used";

var settings = jps.settings;
var fields = {};
for (var i = 0, field; field = jps.settings.fields[i]; i++)
  fields[field.name] = field;
 
if (isCDN.result == 0 || isCDN.result == Response.PERMISSION_DENIED) {
  fields["cdn-addon"].hidden = false;
  fields["cdn-addon"].value = true;
} else {
  fields["cdn-addon"].hidden = true;
  fields["cdn-addon"].value = false;
}

//checking quotas
var extIP = "environment.externalip.enabled",
    extIPperEnv = "environment.externalip.maxcount",
    extIPperNode = "environment.externalip.maxcount.per.node",
    markup = "", cur = null, text = "used", LE = true;

var hasCollaboration = (parseInt('${fn.compareEngine(7.0)}', 10) >= 0),
    quotas = [], group;

if (hasCollaboration) {
    quotas = [
        { quota : { name: extIP }, value: parseInt('${quota.environment.externalip.enabled}', 10) },
        { quota : { name: extIPperEnv }, value: parseInt('${quota.environment.externalip.maxcount}', 10) },
        { quota : { name: extIPperNode }, value: parseInt('${quota.environment.externalip.maxcount.per.node}', 10) }
    ];
    group = { groupType: '${account.groupType}' };  
    jps.settings.fields.push({
        "type": "owner",
        "name": "ownerUid",
        "caption": "Owner"
    });
    fields["envName"].dependsOn = "ownerUid";
} else {
    quotas = jelastic.billing.account.GetQuotas(extIP + ";"+extIPperEnv+";" + extIPperNode).array;
    if (quotas.result != 0) return quotas;
    group = jelastic.billing.account.GetAccount(appid, session);
    if (group.result != 0) return group;
}

for (var i = 0; i < quotas.length; i++){
    var q = quotas[i], n = toNative(q.quota.name);

     if (n == extIP &&  !q.value){
        err(q, "required", 1, true);
        LE  = false; 
    }
    
    if (n == extIPperEnv && q.value < 1){
        if (!markup) err(q, "required", 1, true);
        LE = false;
    }

   if (n == extIPperNode && q.value < 1){
        if (!markup) err(q, "required", 1, true);
        LE = false;
    }
}

if (!LE) {
  fields["displayfield"].markup = "Some advanced features are not available. Please upgrade your account.";
  fields["displayfield"].cls = "warning";
  fields["displayfield"].hideLabel = true;
  fields["displayfield"].height = 25;
  fields["le-addon"].disabled = true;
  fields["le-addon"].value = false;
  fields["message"].markup = "Let's Encrypt is not available. " + markup + "Please upgrade your account.";
  fields["message"].cls = "warning";
  fields["message"].hidden = false;
  fields["message"].height = 30;  
}

return {
    result: 0,
    settings: settings
};

function err(e, text, cur, override){
  var m = (e.quota.description || e.quota.name) + " - " + e.value + ", " + text + " - " + cur + ". ";
  if (override) markup = m; else markup += m;
}
