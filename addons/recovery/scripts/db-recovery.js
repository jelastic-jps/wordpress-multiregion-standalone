
var AUTH_ERROR_CODE = 701,
    UNABLE_RESTORE_CODE = 98,
    FAILED_CLUSTER_CODE = 99,
    envName = "${env.name}",
    exec = getParam('exec', ''),
    nodeGroup = getParam('nodeGroup', ''),
    multiregion = getParam('multiregion', false),
    envName1 = getParam('envName1', ''),
    envName2 = getParam('envName2', ''),
    failedPrimary = [],
    failedNodes = [],
    GALERA = "galera",
    PRIMARY = "primary",
    SECONDARY = "secondary",
    FAILED = "failed",
    SUCCESS = "success",
    WARNING = "warning",
    ROOT = "root",
    DOWN = "down",
    UP = "up",
    OK = "ok",
    isRestore = false,
    envInfo,
    nodeGroups,
    donorIps = {},
    primaryDonorIp = "",
    scenario = "",
    scheme,
    nodes,
    item,
    resp;

if (!exec) isRestore = true;

api.marketplace.console.WriteLog("start3->");
resp = execRecovery();
if (resp.result != 0) return resp;

nodes = resp.responses;

if (multiregion) {
    resp = execRecovery({
        envName: envName == envName1 ? envName2 : envName1
    });
    if (resp.result != 0) return resp;

    for (i = 0, n = resp.responses.length; i < n; i++) {
        if (resp.responses[i]) {
            resp.responses[i].envName = envName == envName1 ? envName2 : envName1;
        }
    }

    nodes.push(resp.responses);
    resp = parseOut(nodes, false);
}
api.marketplace.console.WriteLog("nodes->" + nodes);
api.marketplace.console.WriteLog("resp->" + resp);
api.marketplace.console.WriteLog("isRestore->" + isRestore);
scheme = PRIMARY;

if (isRestore) {
    if (resp.result == AUTH_ERROR_CODE) return resp;

    if (!failedNodes.length) {
        return {
            result: !isRestore ? 200 : 201,
            type: SUCCESS
        };
    }

    if (!scenario || !donorIps[scheme]) {
        return {
            result: UNABLE_RESTORE_CODE,
            type: SUCCESS
        }
    }

    for (var k = 0, l = failedNodes.length; k < l; k++) {
        resp = getNodeIdByIp({
            address: failedNodes[k].address,
            envName: failedNodes[k].envName || envName
        });

        if (resp.result != 0) return resp;

        resp = execRecovery({
            envName: failedNodes[k].envName || envName,
            scenario: scenario,
            donor: donorIps[scheme],
            nodeid: resp.nodeid
        });
        if (resp.result != 0) return resp;

        resp = parseOut(resp.responses, false);
        if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;
    }

} else {
    return resp;
}

function parseOut(data, restorePrimary) {
    var resp,
        nodeid,
        envName,
        statusesUp = false;

    if (data.length) {
        for (var i = 0, n = data.length; i < n; i++) {
            data[i] = JSON.parse(data[i]);
            nodeid = data[i].nodeid;
            envName = data[i].envName;
            item = data[i].out;

            item = JSON.parse(item);

            api.marketplace.console.WriteLog("item->" + item);

            if (item.result == AUTH_ERROR_CODE) {
                return {
                    type: WARNING,
                    message: item.error,
                    result: AUTH_ERROR_CODE
                };
            }

            if (!item.node_type && !isRestore) {
                resp = setFailedDisplayNode(item.address);
                if (resp.result != 0) return resp;
                continue;
            }

            if (item.result == 0) {
                switch(String(scheme)) {
                    case GALERA:
                        if ((item.service_status == UP || item.status == OK) && item.galera_myisam != OK) {
                            return {
                                type: WARNING,
                                message: "There are MyISAM tables in the Galera Cluster. These tables should be converted in InnoDB type"
                            }
                        }
                        if (item.service_status == DOWN || item.status == FAILED) {
                            scenario = " --scenario restore_galera";
                            if (!donorIps[scheme]) {
                                donorIps[GALERA] = GALERA;
                            }

                            failedNodes.push({
                                address: item.address,
                                scenario: scenario
                            });

                        }

                        if (!isRestore && failedNodes.length) {
                            return {
                                result: FAILED_CLUSTER_CODE,
                                type: SUCCESS
                            };
                        }
                        break;

                    case PRIMARY:
                        if (item.service_status == DOWN || item.status == FAILED) {
                            scenario = " --scenario restore_primary_from_primary";

                            if (!donorIps[scheme] && item.service_status == UP) {
                                donorIps[PRIMARY] = item.address;
                            }

                            if (item.service_status == DOWN && item.status == FAILED) {
                                failedNodes.push({
                                    address: item.address,
                                    scenario: scenario,
                                    envName: envName || ""
                                });
                            }
                            if (!isRestore) {
                                return {
                                    result: FAILED_CLUSTER_CODE,
                                    type: SUCCESS
                                };
                            }
                        }

                        if (item.service_status == UP && item.status == OK) {
                            donorIps[PRIMARY] = item.address;
                        }
                        break;

                    case SECONDARY:
                        if (item.service_status == DOWN || item.status == FAILED) {

                            if (!isRestore) {
                                return {
                                    result: FAILED_CLUSTER_CODE,
                                    type: SUCCESS
                                };
                            }

                            if (item.service_status == DOWN && item.status == FAILED) {
                                if (item.node_type == PRIMARY) {
                                    scenario = " --scenario restore_primary_from_secondary";
                                    failedPrimary.push({
                                        address: item.address,
                                        scenario: scenario
                                    });
                                } else {
                                    scenario = " --scenario restore_secondary_from_primary";
                                    failedNodes.push({
                                        address: item.address,
                                        scenario: scenario
                                    });
                                }
                            } else if (item.node_type == PRIMARY) {
                                scenario = " --scenario restore_primary_from_secondary";
                                failedPrimary.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                            } else if (item.status == FAILED) {
                                scenario = " --scenario restore_secondary_from_primary";
                                failedNodes.push({
                                    address: item.address,
                                    scenario: scenario
                                });
                            }
                        }

                        if (item.node_type == PRIMARY) {
                            if (item.service_status == UP && item.status == OK) {
                                primaryDonorIp = item.address;
                            }
                        }

                        if (primaryDonorIp) {
                            donorIps[scheme] = primaryDonorIp;
                            continue;
                        }

                        if (item.service_status == UP && item.status == OK) {
                            donorIps[SECONDARY] = item.address;
                            statusesUp = true;
                        }
                        else if (!statusesUp && item.node_type == SECONDARY && item.service_status == UP) {
                            donorIps[SECONDARY] = item.address;
                        }
                        break;
                }
            } else {
                return {
                    result: isRestore ? UNABLE_RESTORE_CODE : FAILED_CLUSTER_CODE,
                    type: SUCCESS
                };
            }

            api.marketplace.console.WriteLog("donorIps -> " + donorIps);
        }

        if (!isRestore && (failedNodes.length || failedPrimary.length)) {
            return {
                result: FAILED_CLUSTER_CODE,
                type: SUCCESS
            };
        }

        if (!failedNodes.length && failedPrimary.length) {
            failedNodes = failedPrimary;
        }

        if (isRestore && restorePrimary && failedPrimary.length) { //restoreAll

            resp = getNodeIdByIp({
                address: failedPrimary[0].address
            });
            if (resp.result != 0) return resp;

            resp = execRecovery(failedPrimary[0].scenario, donorIps[scheme], resp.nodeid);
            if (resp.result != 0) return resp;
            resp = parseOut(resp.responses);
            if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;
            failedPrimary = [];
            donorIps[scheme] = primaryDonorIp;
        }

        return {
            result: !isRestore ? 200 : 201,
            type: SUCCESS
        };
    }
}

return {
    result: !isRestore ? 200 : 201,
    type: SUCCESS
};

function getNodeIdByIp(values) {
    var envInfo,
        nodes,
        id = "";

    values = values || {};

    envInfo = getEnvInfo({
        envName : values.envName
    });
    if (envInfo.result != 0) return envInfo;

    nodes = envInfo.nodes;

    for (var i = 0, n = nodes.length; i < n; i++) {
        if (nodes[i].address == values.address) {
            id = nodes[i].id;
            break;
        }
    }

    return {
        result: 0,
        nodeid : id
    }
}

function execRecovery(values) {
    var action = "";

    values = values || {};

    if (values.scenario && values.donor) {
        action = values.scenario + " --donor-ip " +  values.donor;
    } else {
        action = exec;
    }
    api.marketplace.console.WriteLog("values->" + values);
    api.marketplace.console.WriteLog("curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/v2.5.0/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + action);
    return cmd({
        command: "curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/v2.5.0/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + action,
        nodeid: values.nodeid || "",
        envName: values.envName || ""
    });
}

function getEnvInfo(values) {
    var resp;

    values = values || {};

    if (!envInfo) {
        envInfo = api.env.control.GetEnvInfo(values.envName || envName, session);
    }

    return envInfo;
}

function cmd(values) {
    var resp;

    values = values || {};

    if (values.nodeid) {
        api.marketplace.console.WriteLog("ExecCmdById->" + values.nodeid);
        resp = api.env.control.ExecCmdById(values.envName || envName, session, values.nodeid, toJSON([{ command: values.command }]), true, ROOT);
    } else {
        resp = api.env.control.ExecCmdByGroup(values.envName || envName, session, values.nodeGroup || nodeGroup, toJSON([{ command: values.command }]), true, false, ROOT);
    }

    return resp;
}

function setFailedDisplayNode(address, removeLabelFailed) {
    var REGEXP = new RegExp('\\b - ' + FAILED + '\\b', 'gi'),
        displayName,
        resp,
        node;

    removeLabelFailed = !!removeLabelFailed;

    resp = getNodeIdByIp(address);
    if (resp.result != 0) return resp;

    resp = getNodeInfoById(resp.nodeid);
    if (resp.result != 0) return resp;
    node = resp.node;

    if (!isRestore && node.displayName.indexOf(FAILED_UPPER_CASE) != -1) return { result: 0 }

    displayName = removeLabelFailed ? node.displayName.replace(REGEXP, "") : (node.displayName + " - " + FAILED_UPPER_CASE);
    return api.env.control.SetNodeDisplayName(envName, session, node.id, displayName);
}
