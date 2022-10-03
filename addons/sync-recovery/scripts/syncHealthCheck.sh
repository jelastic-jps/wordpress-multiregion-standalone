#!/bin/bash

WP_PATH="/var/www/webroot/ROOT"
RUN_LOG="/var/log/sync_diagnostic.log"
SUCCESS_CODE=0
FAIL_CODE=99
USER="jelastic"
VALIDATE_SLEEP=10

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

execAction(){
    local action="$1"
    local message="$2"

    stdout=$( { ${action}; } 2>&1 ) && { log "${message}...done";  } || {
        error="${message} failed, please check ${RUN_LOG} for details"
        execArgResponse "${FAIL_CODE}" "errOut" "${stdout}"
        log "${message}...failed\n==============ERROR==================\n${stdout}\n============END ERROR================";
        exit 0
    }
}

execSshAction(){
  local action="$1"
  local message="$2"
  local result=${FAIL_CODE}

  action_to_base64=$(echo $action|base64 -w 0)
  stderr=$( { sh -c "$(echo ${action_to_base64}|base64 -d)"; } 2>&1 ) && { log "${message}...done"; } || {
    error="${message} failed, please check ${RUN_LOG} for details"
    execArgResponse "${result}" "errOut" "${error}"
    log "${message}...failed\n==============ERROR==================\n${stderr}\n============END ERROR================";
    exit 0
  }
}


execSshReturn(){
  local action="$1"
  local message="$2"
  local result=${FAIL_CODE}

  action_to_base64=$(echo $action|base64 -w 0)
  stdout=$( { sh -c "$(echo ${action_to_base64}|base64 -d)"; } 2>&1 ) && { echo ${stdout}; log "${message}...done"; } || {
    error="${message} failed, please check ${RUN_LOG} for details"
    execArgResponse "${result}" "errOut" "${error}"
    log "${message}...failed\n==============ERROR==================\n${stdout}\n============END ERROR================";
    exit 0
  }
}

createTestFile(){
    local node=$1
    local command="${SSH} ${node} \" su ${USER} -c 'touch ${TMPFILE}'\""
    local message="[Node: ${node}] Сreate temporary check file ${TMPFILE}"
    execSshAction "$command" "$message" || return ${FAIL_CODE}
}

validateTestFile(){
    local node=$1
    local command="${SSH} ${node} \"su ${USER} -c '[[ -f ${TMPFILE} ]] && { echo "true"; } || { exit 1; }'\""
    local message="[Node: ${node}] Validate temporary check file ${TMPFILE}"
    status=$(execSshReturn "$command" "[Node: ${node}] Validate temporary check file ${TMPFILE}")
}

deleteTestFile(){
    local node=$1
    local command="${SSH} ${node} \"su ${USER} -c ' [[ -f ${TMPFILE} ]] && { rm -f ${TMPFILE}; }' \""
    local message="[Node: ${node}] Delete temporary test file ${TMPFILE}"
    execSshAction "$command" "$message" || return ${FAIL_CODE}
}

fileDiagmostic(){
    local src_node=$1
    local dst_node=$2
    local result=${FAIL_CODE}

    TMPFILE=$(mktemp -u ${WP_PATH}/diagnostic.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX);
    createTestFile "${src_node}"
    sleep ${VALIDATE_SLEEP}
    validateTestFile "${dst_node}"
    deleteTestFile "${src_node}"
    echo $status
}

diagnostic(){
    local local_address=${NODE_ADDRESS}
    local remote_address=$2
    local result=${FAIL_CODE}

    check1=$(fileDiagmostic "${local_address}" "${remote_address}")
    check2=$(fileDiagmostic  "${remote_address}" "${local_address}")

    if [[ "${check1}" == "true" ]] && [[ "${check2}" == "true" ]]; then
        log "[ SUCCESS ] The file synchronization between clusters is: OK"
        execArgResponse "${SUCCESS_CODE}" "out" "The file synchronization between clusters is: OK"
    else
        log "[ ERROR ] File synchronization between clusters does not work"
        execArgResponse "${result}" "out" "The file synchronization between clusters does not work"
        exit 0
    fi

}

case ${1} in
    diagnostic)
        diagnostic "$@"
        ;;

esac
