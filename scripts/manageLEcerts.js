//@req(envName, nodeGroup, nodeId)

var SLB = "SLB",
    resp,
    cert_key = readFile("/tmp/privkey.url"),
    cert     = readFile("/tmp/cert.url"),
    chain    = readFile("/tmp/fullchain.url"),
    withExtIp = getParam("withExtIp", true),
    customDomains = getParam("customDomains", ""),
    secondEnvName;

secondEnvName = envName.slice(0, -1) + (envName.slice(-1) == 1 ? '2' : '1');

if (cert_key.body && chain.body && cert.body) {
    resp = bindSSL();
    if (resp.result != 0) return resp;

    if (String(envName).slice(-1) == 1) {
        resp = isExtIpsExist(secondEnvName);
        if (resp.result != 0) return resp;

        api.marketplace.console.WriteLog("second->");
        if (!resp.exist && withExtIp == "true") {
            api.marketplace.console.WriteLog("second2->");
            resp = api.env.binder.SetExtIpCount(secondEnvName, session, "ipv4", 1, nodeGroup);
            if (resp.result != 0) return resp;
        }

        resp = bindSSL(secondEnvName);
        if (resp.result != 0) return resp;
    }
} else {
    return { type: "error", message: "Can't read SSL certificate: key=" + cert_key + " cert=" + cert + " chain=" + chain };
}

return {
    result: 0
};

function readFile(path) {
    return api.env.file.Read(envName, session, path, null, nodeGroup || null, nodeId);
};

function bindSSL(name) {
    if (withExtIp == "true") { 
        return api.env.binder.BindSSL({
            "envName": name || envName,
            "session": session,
            "cert_key": cert_key.body,
            "cert": cert.body,
            "intermediate": chain.body
        });
    } else {
        resp = api.env.binder.AddSSLCert({
            envName: envName,
            session: session,
            key: cert_key.body,
            cert: cert.body,
            interm: chain.body
        });
        if (resp.result != 0) return resp;
        
        resp = api.env.binder.GetSSLCerts(envName, session);
        if (resp.result != 0) return resp;

        return api.env.binder.BindSSLCert({
            envName: envName,
            session: session,
            certId: resp.responses[resp.responses.length - 1].id,
            entryPoint: SLB,
            extDomains: customDomains.replace(/\s+/g, ', ').replace(/ /g, "")
        });
    }
};

function isExtIpsExist(name) {
    var resp,
        node,
        exist = true;

    resp = api.env.control.GetEnvInfo(name, session);
    if (resp.result != 0) return resp;

    for (var i = 0, n = resp.nodes.length; i < n; i++) {
        node = resp.nodes[i];

        if (node.nodeGroup == nodeGroup) {
            if (!node.extIPs && !node.extipsv6) {
                exist = false;
                break;
            }
        }
    }

    return {
        result: 0,
        exist: exist
    };
};
