function DBRecovery() {
    const AUTH_ERROR_CODE = 701,
        UNABLE_RESTORE_CODE = 98,
        FAILED_CLUSTER_CODE = 99,
        RESTORE_SUCCESS = 201,
        GALERA = "galera",
        SECONDARY = "secondary",
        PRIMARY = "primary",
        FAILED_UPPER_CASE = "FAILED",
        FAILED = "failed",
        SUCCESS = "success",
        WARNING = "warning",
        ROOT = "root",
        DOWN = "down",
        UP = "up",
        OK = "ok",
        CP = "cp",
        MyISAM_MSG = "There are MyISAM tables in the Galera Cluster. These tables should be converted in InnoDB type";

    var me = this,
        isRestore = false,
        envName = "${env.name}",
        config = {},
        nodeManager;

    let multiregion = getParam('multiregion', false);

    nodeManager = new nodeManager();

    me.process = function() {
        let resp = me.defineRestore();
        if (resp.result != 0 && !me.getEvent()) return resp;

        resp = me.execRecovery({
            diagnostic: true
        });
        if (resp.result != 0) return resp;

        resp = me.parseResponse(resp.responses, true);

        if (isRestore) {
            let failedPrimaries = me.getFailedPrimaries();
            if (failedPrimaries.length) {
                resp = me.recoveryNodes(failedPrimaries);
                if (resp.result != 0) return resp;

                resp = me.getSecondariesOnly();
                if (resp.result != 0) return resp;

                me.setFailedNodes(resp.nodes, true);
                me.primaryRestored(true);
            }

            resp = me.recoveryNodes();
            if (resp.result != 0) return resp;
        } else {
            log("me.getEvent()" + me.getEvent());
            log("me.getAction()" + me.getAction());
            if (me.getEvent() && me.getAction()) {
                return {
                    result: 0,
                    errors: resp.result == FAILED_CLUSTER_CODE ? true : false
                };
            }
        }
        if (resp.result != 0) return resp;

        return {
            result: !isRestore ? 200 : 201,
            type: SUCCESS
        };
    };

    me.defineScheme = function() {
        const MASTER = "master",
            SLAVE = "slave";

        let resp = nodeManager.getNodeGroups();
        if (resp.result != 0) return resp;

        let nodeGroups = resp.nodeGroups;

        for (let i = 0, n = nodeGroups.length; i < n; i++) {
            if (nodeGroups[i].name == CP && nodeGroups[i].cluster && nodeGroups[i].cluster.enabled) {
                if (nodeGroups[i].cluster.settings) {
                    let scheme = nodeGroups[i].cluster.settings.scheme;
                    if (scheme == SLAVE || scheme == SECONDARY) scheme = SECONDARY;
                    if (scheme == MASTER || scheme == PRIMARY) scheme = PRIMARY;
                    me.setScheme(scheme);
                    break;
                }
            }
        }

        return { result: 0 }
    };

    me.defineRestore = function() {
        let exec = getParam('exec', '');
        let init = getParam('init', '');
        let event = getParam('event', '');
        let multiregion = getParam('multiregion', false);
        let resp;

        if (!exec) isRestore = true;
        exec = exec || " --diagnostic";

        if (init) {
            me.setInitialize(true);
            resp = me.execRecovery();
            if (resp.result != 0) return resp;
            me.setInitialize(false);

            resp = me.parseResponse(resp.responses);
            if (resp.result != 0) return resp;
        }

        me.setAction(exec);
        me.setEvent(event);
        me.setScenario();

        if (multiregion) {
            me.setScheme(PRIMARY);
            resp = me.processMultiRegion();
            if (resp.result != 0) return resp;
            // me.setEvent(true);
        } else {
            resp = me.defineScheme();
            if (resp.result != 0) return resp;
        }

        return { result: 0 };
    };

    me.processMultiRegion = function() {
        let envName1 = getParam('envName1', '');
        let envName2 = getParam('envName2', '');

        me.setEnvNames([envName1, envName2]);

        let resp = me.execRecovery({
            envName: envName == envName1 ? envName2 : envName1,
            diagnostic: true
        });
        if (resp.result != 0) return resp;

        for (let i = 0, n = resp.responses.length; i < n; i++) {
            if (resp.responses[i]) {
                resp.responses[i].envName = envName == envName1 ? envName2 : envName1;
                // me.setFailedNodes(resp.responses[i]);
            }
        }
        return me.parseResponse(resp.responses);
    };

    me.getScheme = function() {
        return config.scheme;
    };

    me.setScheme = function(scheme) {
        config.scheme = scheme;
    };

    me.getEnvNames = function() {
        return config.envNames;
    };

    me.setEnvNames = function(envNames) {
        config.envNames = envNames;
    };

    me.setScenario = function() {
        config.scenarios = {};
        config.scenarios[GALERA] = "galera";
        config.scenarios[PRIMARY] = "secondary_from_primary";
        config.scenarios[PRIMARY + "_" + PRIMARY] = "primary_from_primary";
        config.scenarios[PRIMARY + "_" + SECONDARY] = "primary_from_secondary";
        config.scenarios[SECONDARY] = "secondary_from_primary";
    };

    me.getScenario = function(scenario) {
        return config.scenarios[scenario];
    };

    me.getInitialize = function() {
        return config.initialize || false;
    };

    me.setInitialize = function(init) {
        config.initialize = init;
    };

    me.getEvent = function() {
        return config.event || false;
    };

    me.setEvent = function(event) {
        config.event = event;
    };

    me.getAction = function() {
        return config.action;
    };

    me.setAction = function(action) {
        config.action = action;
    };

    me.getFailedNodes = function() {
        return config.failedNodes || [];
    };

    me.setFailedNodes = function(node, updateValue) {
        if (updateValue) {
            config.failedNodes = node;
        } else {
            config.failedNodes = config.failedNodes || [];
            config.failedNodes.push(node);
        }
    };

    me.getFailedPrimaries = function() {
        return config.failedPrimaries || [];
    };

    me.setFailedPrimaries = function(node) {
        config.failedPrimaries = config.failedPrimaries || [];
        config.failedPrimaries.push(node);
    };

    me.primaryRestored = function(restored) {
        if (restored) {
            config.primaryRestored = restored;
        }
        return config.primaryRestored || false;
    };

    me.setPrimaryDonor = function(primary) {
        config.primaryDonor = primary;
    };

    me.getPrimaryDonor = function() {
        return config.primaryDonor || "";
    };

    me.getAdditionalPrimary = function() {
        return config.additionalPrimary || "";
    };

    me.setAdditionalPrimary = function(primary) {
        config.additionalPrimary = primary;
    };

    me.getDonorIp = function() {
        return config.donorIp;
    };

    me.setDonorIp = function(donor) {
        config.donorIp = donor;
    };

    me.parseResponse = function parseResponse(response) {
        let resp;

        for (let i = 0, n = response.length; i < n; i++) {
            if (response[i] && response[i].out) {
                let item = response[i].out;
                item = JSON.parse(item);
                log("item->" + item);

                if (item.result == AUTH_ERROR_CODE) {
                    return {
                        type: WARNING,
                        message: item.error,
                        result: AUTH_ERROR_CODE
                    };
                }

                if (!item.node_type) {
                    if (!isRestore) {
                        let resp = nodeManager.setFailedDisplayNode(item.address);
                        if (resp.result != 0) return resp;
                        continue;
                    }
                }

                log("item.result->" + item.result);
                if (item.result == 0) {
                    switch (String(me.getScheme())) {
                        case GALERA:
                            resp = me.checkGalera(item);
                            if (resp.result != 0) return resp;
                            break;

                        case PRIMARY:
                            log("primary->");
                            resp = me.checkPrimary(item);
                            if (resp.result != 0) return resp;
                            break;

                        case SECONDARY:
                            resp = me.checkSecondary(item);
                            if (resp.result != 0) return resp;
                            break;
                    }
                } else {
                    return {
                        result: isRestore ? UNABLE_RESTORE_CODE : FAILED_CLUSTER_CODE,
                        type: SUCCESS
                    };
                }
            }
        }

        return { result: 0 }
    };

    me.checkGalera = function checkGalera(item) {
        if ((item.service_status == UP || item.status == OK) && item.galera_myisam != OK) {
            return {
                type: WARNING,
                message: MyISAM_MSG
            }
        }

        if (item.service_status == DOWN || item.status == FAILED) {
            if (!me.getDonorIp()) {
                me.setDonorIp(GALERA);
            }

            me.setFailedNodes({
                address: item.address,
                scenario: me.getScenario(GALERA)
            });

            if (!isRestore) {
                let resp = nodeManager.setFailedDisplayNode(item.address);
                if (resp.result != 0) return resp;
            }
        }

        if (!isRestore && me.getFailedNodes().length) {
            return {
                result: FAILED_CLUSTER_CODE,
                type: SUCCESS
            };
        }

        if (item.service_status == UP && item.status == OK) {
            let resp = nodeManager.setFailedDisplayNode(item.address, true);
            if (resp.result != 0) return resp;
        }

        return {
            result: 0
        }
    };

    me.checkPrimary = function(item) {
        let resp;

        if (item.service_status == DOWN || item.status == FAILED) {

            log("in if->");
            if (item.service_status == UP) {
                if (!me.getDonorIp()) {
                    me.setDonorIp(item.address);
                }

                if (item.address == "${nodes.sqldb.master.address}") {
                    me.setPrimaryDonor(item.address);
                }
            }

            log("before setFailedDisplayNode00->");
            if (!isRestore) {
                log("before setFailedDisplayNode->");
                log("item.address->" + item.address);
                resp = nodeManager.setFailedDisplayNode(item.address);
                log("setFailedDisplayNode resp->" + resp);
                if (resp.result != 0) return resp;
                if (!resp.nodeid) {
                    let envNames = me.getEnvNames();
                    resp = nodeManager.getNodeIdByIp({
                        envName: envName == envNames[0] ? envNames[1] : envNames[0],
                        address: item.address
                    });
                    if (resp.result != 0) return resp;
                }

                return {
                    result: FAILED_CLUSTER_CODE,
                    type: SUCCESS
                };
            }

            if (item.status == FAILED) {
                me.setFailedNodes({
                    address: item.address,
                    envName: item.envName || envName
                });
            }
        }

        if (item.service_status == UP && item.status == OK) {
            if (item.node_type == PRIMARY) {
                me.setDonorIp(item.address);
            } else {
                if (!me.getDonorIp()) {
                    me.setDonorIp(item.address);
                }
            }

            resp = nodeManager.setFailedDisplayNode(item.address, true);
            if (resp.result != 0) return resp;
        }

        return {
            result: 0
        }
    };

    me.checkSecondary = function(item) {
        let resp;

        if (item.service_status == DOWN || item.status == FAILED) {
            if (!isRestore) {
                resp = nodeManager.setFailedDisplayNode(item.address);
                if (resp.result != 0) return resp;
                return {
                    result: FAILED_CLUSTER_CODE,
                    type: SUCCESS
                };
            }

            if (item.node_type == PRIMARY) {
                me.setFailedPrimaries({
                    address: item.address,
                    scenario: me.getScenario(PRIMARY + "_" + SECONDARY)
                });
            } else {
                me.setFailedNodes({
                    address: item.address,
                    scenario: me.getScenario(SECONDARY)
                });
            }
        }

        if (item.service_status == UP && item.status == OK) {
            if (item.node_type == PRIMARY) {
                me.setPrimaryDonor(item.address);
            }

            me.setDonorIp(item.address);
            resp = nodeManager.setFailedDisplayNode(item.address, true);
            if (resp.result != 0) return resp;
        } else if (item.node_type == SECONDARY && item.service_status == UP) {
            me.setDonorIp(item.address);
        }

        if (me.getPrimaryDonor()) {
            me.setDonorIp(me.getPrimaryDonor());
        }

        return {
            result: 0
        }
    };

    me.recoveryNodes = function recoveryNodes(nodes) {
        let failedNodes = nodes || me.getFailedNodes();
        log("failedNodes->" + failedNodes);

        if (failedNodes.length) {
            for (let i = 0, n = failedNodes.length; i < n; i++) {
                let resp = nodeManager.getNodeIdByIp(failedNodes[i].address);
                if (resp.result != 0) return resp;

                resp = me.execRecovery({ nodeid: resp.nodeid });
                if (resp.result != 0) return resp;

                resp = me.parseResponse(resp.responses);
                if (resp.result == UNABLE_RESTORE_CODE || resp.result == FAILED_CLUSTER_CODE) return resp;
            }
        }

        return  { result: 0 }
    };

    me.execRecovery = function(values) {
        log("values->" + values);
        values = values || {};
        api.marketplace.console.WriteLog("curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/master/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + me.formatRecoveryAction(values.diagnostic));
        return nodeManager.cmd({
            command: "curl --silent https://raw.githubusercontent.com/jelastic-jps/mysql-cluster/master/addons/recovery/scripts/db-recovery.sh > /tmp/db-recovery.sh && bash /tmp/db-recovery.sh " + me.formatRecoveryAction(values.diagnostic),
            nodeid: values.nodeid || "",
            envName: values.envName
        });
    };

    me.formatRecoveryAction = function(diagnostic) {
        let scenario = me.getScenario(me.getScheme());
        let donor = me.getDonorIp();
        let action = "";

        if (diagnostic) return " --diagnostic";

        if (me.getInitialize()) {
            return "init";
        }

        if (!me.primaryRestored() && me.getFailedPrimaries().length) {
            scenario = me.getScenario(PRIMARY + "_" + ((me.getScheme() == SECONDARY) ? SECONDARY : PRIMARY));
        } else {
            if (me.getAdditionalPrimary()) {
                donor = me.getPrimaryDonor() + " --additional-primary " + me.getAdditionalPrimary();
            }
        }

        if (me.getEnvNames().length) {
            scenario = me.getScenario(PRIMARY + "_" + PRIMARY);
        }

        if (scenario && donor) {
            action = "--scenario restore_" + scenario + " --donor-ip " + donor;
        } else {
            action = me.getAction();
        }

        return action;
    };

    me.getSecondariesOnly = function() {
        let secondaries = [];

        let resp = nodeManager.getSQLNodes();
        if (resp.result != 0) return resp;

        for (let i = 0, n = resp.nodes.length; i < n; i++) {
            if (resp.nodes[i].address != me.getPrimaryDonor() && resp.nodes[i].address != me.getAdditionalPrimary()) {
                secondaries.push({
                    address: resp.nodes[i].address
                });
            }
        }

        return {
            result: 0,
            nodes: secondaries
        }
    };

    function nodeManager() {
        var me = this,
            envInfo;

        me.getEnvInfo = function(values) {
            values = values || {};
            
            if (!envInfo || values.reset) {
                envInfo = api.env.control.GetEnvInfo(values.envName || envName, session);
            }

            return envInfo;
        };

        me.getNodeGroups = function() {
            var envInfo;

            envInfo = this.getEnvInfo();
            if (envInfo.result != 0) return envInfo;

            return {
                result: 0,
                nodeGroups: envInfo.nodeGroups
            }
        };

        me.getSQLNodes = function() {
            var resp,
                sqlNodes = [],
                nodes;

            resp = me.getEnvInfo();
            if (resp.result != 0) return resp;
            nodes = resp.nodes;

            for (var i = 0, n = nodes.length; i < n; i++) {
                if (nodes[i].nodeGroup == CP) {
                    sqlNodes.push(nodes[i]);
                }
            }

            return {
                result: 0,
                nodes: sqlNodes
            }
        };

        me.getNodeIdByIp = function(values) {
            var envInfo,
                nodes,
                id = "",
                multiregion = getParam('multiregion', false);

            envInfo = me.getEnvInfo({
                envName : values.envName,
                reset: values.reset || false
            });
            if (envInfo.result != 0) return envInfo;

            nodes = envInfo.nodes;

            log("getNodeIdByIp222 nodes->" + nodes);
            for (var i = 0, n = nodes.length; i < n; i++) {
                log("nodes[i].address->" + nodes[i].address);
                if (nodes[i].address == values.address) {
                    id = nodes[i].id;
                    break;
                }
            }

            log("getNodeIdByIp2 values->" + values);
            // if (!id && multiregion && !values.secondEnv) {
            //     let envName1 = getParam('envName1', '');
            //     let envName2 = getParam('envName2', '');
            //     let resp = me.getNodeIdByIp({
            //         envName: values.envName == envName1 ? envName2 : envName1,
            //         secondEnv: true
            //     });
            //     log("getNodeIdByIp2 resp->" + resp);
            //     if (resp.result != 0) return resp;
            //     if (resp.nodeid) id = resp.nodeid;
            // }
            log("getNodeIdByIp id->" + id);

            return {
                result: 0,
                nodeid : id
            }
        };

        me.getNodeInfoById = function(id) {
            var envInfo,
                nodes,
                node;

            envInfo = me.getEnvInfo();
            if (envInfo.result != 0) return envInfo;

            nodes = envInfo.nodes;

            for (var i = 0, n = nodes.length; i < n; i++) {
                if (nodes[i].id == id) {
                    node = nodes[i];
                    break;
                }
            }

            return {
                result: 0,
                node: node
            }
        };

        me.setFailedDisplayNode = function(address, removeLabelFailed) {
            var REGEXP = new RegExp('\\b - ' + FAILED + '\\b', 'gi'),
                displayName,
                resp,
                node;

            removeLabelFailed = !!removeLabelFailed;

            log("setFailedDisplayNode address->" + address);
            resp = me.getNodeIdByIp({
                address: address
            });

            if (resp.result == 0 && multiregion && !resp.nodeid) {
                log("in if (multiregion && !resp.nodeid) {->");
                let envName1 = getParam('envName1', '');
                let envName2 = getParam('envName2', '');

                resp = me.getNodeIdByIp({
                    envName: envName == envName1 ? envName2 : envName1,
                    address: address,
                    reset: true
                });
                log("resp second getNodeIdByIp->" + resp);
            }

            if (resp.result != 0 || !resp.nodeid) return resp;

            resp = me.getNodeInfoById(resp.nodeid);
            log("getNodeInfoById resp->" + resp);
            if (resp.result != 0) return resp;
            node = resp.node;

            node.displayName = node.displayName || ("Node ID: " + node.id);

            if (!isRestore && node.displayName.indexOf(FAILED_UPPER_CASE) != -1) return { result: 0 }

            displayName = removeLabelFailed ? node.displayName.replace(REGEXP, "") : (node.displayName + " - " + FAILED_UPPER_CASE);
            log("displayName->" + displayName);
            return api.env.control.SetNodeDisplayName(envName, session, node.id, displayName);
        };

        me.cmd = function(values) {
            let resp;

            values = values || {};

            if (values.nodeid) {
                resp = api.env.control.ExecCmdById(values.envName || envName, session, values.nodeid, toJSON([{ command: values.command }]), true, ROOT);
            } else {
                resp = api.env.control.ExecCmdByGroup(values.envName || envName, session, values.nodeGroup || CP, toJSON([{ command: values.command }]), true, false, ROOT);
            }

            return resp;
        }
    };

    function log(message) {
        if (api.marketplace && jelastic.marketplace.console && message) {
            return api.marketplace.console.WriteLog(appid, session, message);
        }

        return { result : 0 };
    }
};

return new DBRecovery().process();
