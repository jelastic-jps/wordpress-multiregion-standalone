import com.hivext.api.Response;

var cdnAppid = "c05ffa5b45628a2a0c95467ebca8a0b4",
    lsAppid = "9e6afcf310004ac84060f90ff41a5aba",
    fields = {},
    field,
    resp,
    LE = "le-addon",
    LS = "ls-addon",
    CDN = "cdn-addon",
    advancedFeatures = false;

let hasCollaboration = (parseInt('${fn.compareEngine(7.0)}', 10) >= 0);
let extIP = "environment.externalip.enabled";
let extIPperEnv = "environment.externalip.maxcount";
let extIPperNode = "environment.externalip.maxcount.per.node";
let quotas, markup = "", count = 0, ext_ip, height;

function defineAppFields(appid, name) {
    resp = jelastic.dev.apps.GetApp(appid);

    if (resp.result == 0 || resp.result == Response.PERMISSION_DENIED) {
        fields[name].hidden = false;
        fields[name].value = true;
        advancedFeatures = true;
    } else {
        fields[name].hidden = true;
        fields[name].value = false;
    }
}

function err(e, override) {
    let m = (e.quota.description || e.quota.name) + " - " + e.value + "; ";
    if (override) markup = m; else markup += m;
}

jps.settings = jps.settings || {};
jps.settings.fields = jps.settings.fields || [];

for (var i = 0, n = jps.settings.fields.length; i < n; i++) {
    field = jps.settings.fields[i];
    fields[field.name] = field;
}

if (fields[CDN]) defineAppFields(cdnAppid, CDN);
if (fields[LS]) defineAppFields(lsAppid, LS);
if (hasCollaboration) {
    quotas = [
        { quota : { name: extIP }, value: parseInt('${quota.environment.externalip.enabled}', 10) },
        { quota : { name: extIPperEnv }, value: parseInt('${quota.environment.externalip.maxcount}', 10) },
        { quota : { name: extIPperNode }, value: parseInt('${quota.environment.externalip.maxcount.per.node}', 10) }
    ];
} else {
    resp = jelastic.billing.account.GetQuotas(extIP + ";"+extIPperEnv+";" + extIPperNode );
    if (resp.result != 0) return resp;
    quotas = resp.array;
}

for (let i = 0, n = quotas.length; i < n; i++) {
    let q = quotas[i], name = toNative(q.quota.name);
    if (name == extIP && !q.value) {
        count += 1;
        ext_ip = false;
        err(q, false);
    }

    if (name == extIPperEnv && q.value < 1) {
        count += 1;
        ext_ip = false;
        err(q, false);
    }

    if (name == extIPperNode && q.value < 1) {
        count += 1;
        ext_ip = false;
        err(q, false);
    }
}

if (quotas[0].value == 0 || quotas[1].value == 0 || quotas[2].value == 0) {
    fields[LE].hidden = true;
    fields[LE].value = false;
    height = (count > 3) ? 60 : 30;

    jps.settings.fields.push({"type": "displayfield", "cls": "warning", "height": height, "hideLabel": true, "markup": "Using of Let's Encrypt add-on with public IP's is not possible because of such quota's values: " + markup});
} else {
    advancedFeatures = true;
}

if (!advancedFeatures) {
    fields["displayfield"].hidden = true;
}

resp = api.environment.control.GetEnvs();
if (resp.result != 0) return resp;

if (parseInt("${quota.environment.maxcount:0}", 10) <= resp.infos.length) {
    jps.settings.fields.push({
        type: "displayfield",
        cls: "warning",
        height: 30,
        hideLabel: true,
        hidden: false,
        markup: "The number of environments is limited to ${quota.environment.maxcount} per account. Please contact support to get extended possibilities."
    });
    jps.settings.fields.push({
        "type": "compositefield",
        "height": 0,
        "hideLabel": true,
        "width": 0,
        "items": [{
            "height": 0,
            "type": "string",
            "required": true,
        }]
    });
}


return {
    result: 0,
    settings: jps.settings
};
