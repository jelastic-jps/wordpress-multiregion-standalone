<p align="center">
<img style="padding: 0 15px; float: left;" src="images/mysql-mariadb-recovery-white-bg.png" width="70">
</p>

# Database Restore and Recovery Add-On for Multi-Region WordPress Cluster

This add-on provides an automated solution for database restoration and even recovery of fully corrupted nodes. It is specially designed to work with the database cluster utilized in the multi-region WordPress solution. As a result, this add-on version supports solely the *Primary-Primary* database cluster topology, which speeds up the diagnostic and recovery methods provision.


## Add-On Installtion

The add-on is installed automatically during the **Multi-Region WordPress Cluster** creation. It is available via the list of add-ons of the database layer:

![installed add-ons](images/03-installed-addons.png)


## Database Recovery How To

The add-on allows doing two actions:

- **Cluster Diagnostic** - with this action, the add-on automatically scans all nodes in the cluster in order to identify whether the nodes are accessible and whether databases are consistent. If during diagnostic the database corruption or even node failure is detected, the add-on will warn you with a respective pop-up window:

![diagnostic failure](images/04-diagnostic-failure.png)

> **Tip:** Cluster diagnostic is triggered automatically before the **environment stop** and **cloudlets change** operations. The respective actions will proceed only if the database integrity is verified (to avoid additional damage to the cluster).

- **Cluster Recovery** - if any failure has been detected, you can either try automatic database recovery by pressing the **Cluster Recovery** button or perform manual database recovery by following the link to the recovery guide. The best practice is to use the automatic recovery scenario.

To perform automatic recovery, provide database user credentials either you got upon database cluster installation or the credentials of another privileged user you created.

In case the automatic recovery fails and you go with manual recovery flow, first look at the ***/var/log/db_recovery.log*** file to better understand the nature of the detected error. Then you can try to recover using our guide following the link in the **Information** window and official documentation from [MySQL](https://mysql.org)/[MariaDB](https://mariadb.org)/[Percona](https://www.percona.com/) teams.
