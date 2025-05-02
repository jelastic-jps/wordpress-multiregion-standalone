import com.hivext.api.Response;
import org.yaml.snakeyaml.Yaml;
import com.hivext.api.core.utils.Transport;

var cdnAppid = "c05ffa5b45628a2a0c95467ebca8a0b4test";
var lsAppid = "9e6afcf310004ac84060f90ff41a5aba";
var isCDN = jelastic.dev.apps.GetApp(cdnAppid);
var isLS = jelastic.dev.apps.GetApp(lsAppid);

//checking quotas
var maxCloudletsPerRec = "environment.maxcloudletsperrec",
    extIP = "environment.externalip.enabled",
    extIPperEnv = "environment.externalip.maxcount",
    extIPperNode = "environment.externalip.maxcount.per.node";

var maxCloudlets = 16,
    markup = "", cur = null, prod = true, le_markup = "", le = true, warn_text = "";

var hasCollaboration = (parseInt("${fn.compareEngine(7.0)}", 10) >= 0),
    quotas = [], group;

var settings = jps.settings;
var fields = {};
for (var i = 0, field; field = jps.settings.fields[i]; i++)
  fields[field.name] = field;

if (hasCollaboration) {
    quotas = [
      { quota : { name: maxCloudletsPerRec, description: getQuotaDescription(maxCloudletsPerRec) }, value: parseInt('${quota.environment.maxcloudletsperrec}', 10) },
      { quota : { name: extIP, description: getQuotaDescription(extIP) }, value: parseInt('${quota.environment.externalip.enabled}', 10) },
      { quota : { name: extIPperEnv, description: getQuotaDescription(extIPperEnv) }, value: parseInt('${quota.environment.externalip.maxcount}', 10) },
      { quota : { name: extIPperNode, description: getQuotaDescription(extIPperNode) }, value: parseInt('${quota.environment.externalip.maxcount.per.node}', 10) }
    ];
    jps.settings.fields.push({
      "type": "owner",
      "name": "ownerUid",
      "caption": "Owner"
    });
    fields["envName"].dependsOn = "ownerUid";
    group = { groupType: '${account.groupType}' };
} else {      
    quotas.push(jelastic.billing.account.GetQuotas(maxCloudletsPerRec).array[0]);
    quotas.push(jelastic.billing.account.GetQuotas(extIP).array[0]);
    quotas.push(jelastic.billing.account.GetQuotas(extIPperEnv).array[0]);
    quotas.push(jelastic.billing.account.GetQuotas(extIPperNode).array[0]);
    group = jelastic.billing.account.GetAccount(appid, session);
}

for (var i = 0; i < quotas.length; i++){
    var q = quotas[i], n = toNative(q.quota.name);

    if (n == maxCloudletsPerRec && maxCloudlets > q.value){
        markup = err(q, "required", maxCloudlets);
        prod  = false; break;
    }

    if (n == extIP &&  !q.value){
      le_markup = err(q, "required", 1);
      le  = false; break;
    }

    if (n == extIPperEnv && q.value < 1){
      le_markup = err(q, "required", 1);
      le = false; break;
    }

    if (n == extIPperNode && q.value < 1){
      le_markup = err(q, "required", 1);
      le = false; break;
    }

    if (isLS.result == 0 || isLS.result == Response.PERMISSION_DENIED) {  
      fields["ls-addon"].hidden = false;
      fields["ls-addon"].value = true;
    } else {
      fields["ls-addon"].hidden = true;
      fields["ls-addon"].value = false;
      fields["ls-addon"].showIf = null;
    }

    if (isCDN.result == 0 || isCDN.result == Response.PERMISSION_DENIED) {
      fields["cdn-addon"].hidden = false;
      fields["cdn-addon"].value = true;
    } else {
      fields["cdn-addon"].hidden = true;
      fields["cdn-addon"].value = false;
    }
}

if (!le) {
  disableFields(["le-addon"]);
  setDisplayWarning("displayfield", "Some advanced features are not available.", 25);
  warn_text = warn_text + " L'ets Encrypt is not available. " + le_markup + "Please upgrade your account.";
  setDisplayWarning("message", warn_text, 30);
}

if (!prod || group.groupType == 'trial') {
  disableFields(["ls-addon", "le-addon", "cdn-addon"]);    
  setDisplayWarning("displayfield", "Advanced features are not available.", 25);
  warn_text = (group.groupType == 'trial')
    ? "WordPress cluster is not available for " + group.groupType + ". Please upgrade your account."
    : "WordPress cluster is not available. " + markup + " Please upgrade your account.";
  setDisplayWarning("message", warn_text, 30);
  settings.submitType = 'upgrade';
}

var regions = jelastic.env.control.GetRegions(appid, session);
if (regions.result != 0) return regions;

if (regions.array.length < 2) {
  disableFields(["ls-addon", "le-addon", "cdn-addon"]);
  warn_text = "Cluster cannot be installed on less than 2 regions. Please contact support or choose a provider with more regions";
  setDisplayWarning("message", warn_text, 30);
  settings.submitType = 'support';
}

function disableFields(names) {
  for (var i = 0; i < names.length; i++) {
    if (fields[names[i]]) {
      fields[names[i]].value = false;
      fields[names[i]].disabled = true;
    }
  }
}

function setDisplayWarning(field, warn_text, height) {
  fields[field].markup = warn_text;
  fields[field].cls = "warning";
  fields[field].hideLabel = true;
  fields[field].hidden = false;
  fields[field].height = height;
}

function getQuotaDescription(name) {
  return jelastic.billing.account.GetQuotas(name).array[0].quota.description;
}

function err(e, text, cur){
  var m = (e.quota.description || e.quota.name) + " - " + e.value + ", " + text + " - " + cur + ". ";
  return m;
}

return {
    result: 0,
    settings: settings
};
