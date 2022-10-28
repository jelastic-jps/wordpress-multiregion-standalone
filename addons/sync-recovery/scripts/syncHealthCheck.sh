#!/bin/bash

WP_PATH="/var/www/webroot/ROOT"
RUN_LOG="/var/log/sync_diagnostic.log"
SUCCESS_CODE=200
FAIL_CODE=99
USER="jelastic"

PRIVATE_KEY='/root/.ssh/id_rsa_sync_monitoring'
SSH="timeout 300 ssh -i ${PRIVATE_KEY} -T -o StrictHostKeyChecking=no"

NODE_ADDRESS=$(ifconfig | grep 'inet' | awk '{ print $2 }' |grep -E '^(192\.168|10\.|172\.1[6789]\.|172\.2[0-9]\.|172\.3[01]\.)')

log(){
    local message="$1"
    local timestamp
    timestamp=`date "+%Y-%m-%d %H:%M:%S"`
    echo -e "[${timestamp}]: ${message}" >> ${RUN_LOG}
}

execArgResponse(){
    local result=$1
    local key_name=$2
    local response=$3
    output=$(jq -cn --raw-output --argjson result "$result" --arg key $key_name --arg response "${response}" '{result: $result, ($key): $response}')
    echo ${output}
}

execSshAction(){
  local action="$1"
  local message="$2"
  action_to_base64=$(echo $action|base64 -w 0)
  stderr=$( { sh -c "$(echo ${action_to_base64}|base64 -d)"; } 2>&1 ) && { log "${message}...done"; } || { log "${message}...failed"; }
}

execSshReturn(){
  local action="$1"
  local message="$2"
  action_to_base64=$(echo $action|base64 -w 0)
  stdout=$( { sh -c "$(echo ${action_to_base64}|base64 -d)"; } 2>&1 ) && { echo ${stdout}; log "${message}...done"; } || { log "${message}...failed"; }
}

createTestFile(){
    local node=$1
    local command="${SSH} ${node} \" su ${USER} -c 'touch ${TMPFILE}'\""
    local message="[Node: ${node}] Сreate temporary check file ${TMPFILE}"
    execSshAction "$command" "$message"
}

validateTestFile(){
    local node=$1
    local command="${SSH} ${node} \"for retry in $(seq 1 10);  do [[ -f ${TMPFILE} ]] && { echo 'true'; exit 0; }; sleep 5; done; exit 1\""
    local message="[Node: ${node}] Validate temporary check file ${TMPFILE}"
    status=$(execSshReturn "$command" "[Node: ${node}] Validate temporary check file ${TMPFILE}")
}

deleteTestFile(){
    local node=$1
    local command="${SSH} ${node} \"su ${USER} -c ' [[ -f ${TMPFILE} ]] && { rm -f ${TMPFILE}; }' \""
    local message="[Node: ${node}] Delete temporary test file ${TMPFILE}"
    execSshAction "$command" "$message"
}

checkLsyncServiceStatus(){
    local node=$1
    local command="${SSH} ${node} \"ps aux | grep '/usr/bin/lsync' | grep -v grep | wc -l\""
    local message="[Node: ${node}] Checking lsync service"
    status=$(execSshReturn "$command" "$message")
    if [[ "$status" -lt 1 ]]; then
      log "[Node: ${node}] Lsync service is not running...FAILED"
      return ${FAIL_CODE};
    else
      log "[Node: ${node}] Lsync service is running...SUCCESS"
    fi
}

checkRsyncServiceStatus(){
    local node=$1
    local command="${SSH} ${node} \"ps aux | grep '/usr/bin/rsync' | grep -v grep | wc -l\""
    local message="[Node: ${node}] Checking rsync service"
    status=$(execSshReturn "$command" "$message")
    if [[ "$status" -lt 1 ]]; then
        log "[Node: ${node}] Rsync service is not running...FAILED"
        return ${FAIL_CODE}
    else
        log "[Node: ${node}] Rsync service is running...SUCCESS"
    fi
}

fileDiagnostic(){
    local src_node=$1
    local dst_node=$2
    TMPFILE=$(mktemp -u ${WP_PATH}/diagnostic.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX);
    createTestFile "${src_node}"
    validateTestFile "${dst_node}"
    deleteTestFile "${dst_node}"
    deleteTestFile "${src_node}"
    if [[ "${status}" == "true" ]] ; then
        log "The file synchronization from ${src_node} to ${dst_node} is working...SUCCESS"
    else
        log "The file synchronization from ${src_node} to ${dst_node} is not working...FAILED"
        return ${FAIL_CODE}
    fi
}

diagnostic(){
    local local_address=${NODE_ADDRESS}
    local remote_address=$2
    local result=${SUCCESS_CODE}

    log ">>>BEGIN DIAGNOSTIC"
    checkLsyncServiceStatus "${local_address}" || { result=${FAIL_CODE}; };
    checkRsyncServiceStatus "${local_address}" || { result=${FAIL_CODE}; };
    checkLsyncServiceStatus "${remote_address}" || { result=${FAIL_CODE}; };
    checkRsyncServiceStatus "${remote_address}" || { result=${FAIL_CODE}; };
    fileDiagnostic "${local_address}" "${remote_address}"  || { result=${FAIL_CODE}; };
    fileDiagnostic  "${remote_address}" "${local_address}" || { result=${FAIL_CODE}; };
    if [[ "${result}" == ${SUCCESS_CODE} ]]; then
        log "[ SUCCESS ] The file synchronization between clusters is: OK"
        execArgResponse "${SUCCESS_CODE}" "out" "The file synchronization between clusters is: OK"
    else
        log "[ ERROR ] File synchronization between clusters does not work"
        execArgResponse "${FAIL_CODE}" "out" "The file synchronization between clusters does not work, please check ${RUN_LOG} for details"
    fi
    log ">>>END DIAGNOSTIC"
}

case ${1} in
    diagnostic)
        diagnostic "$@"
        ;;
esac
