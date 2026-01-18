-- --------------------------------------------------------
-- Host:                         127.0.0.1
-- Server-Version:               11.6.2-MariaDB - mariadb.org binary distribution
-- Server-Betriebssystem:        Win64
-- HeidiSQL Version:             12.8.0.6908
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Exportiere Datenbank-Struktur für js_hmi_config
CREATE DATABASE IF NOT EXISTS `js_hmi_config` /*!40100 DEFAULT CHARACTER SET latin1 COLLATE latin1_swedish_ci */;
USE `js_hmi_config`;

-- Exportiere Struktur von Tabelle js_hmi_config.hmi
CREATE TABLE IF NOT EXISTS `hmi` (
  `key` varchar(384) NOT NULL,
  `queryParameter` varchar(384) NOT NULL,
  `viewObject` varchar(384) NOT NULL,
  `flags` tinyint(4) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  UNIQUE KEY `key` (`key`),
  UNIQUE KEY `queryParameter` (`queryParameter`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- Daten-Export vom Benutzer nicht ausgewählt

-- Exportiere Struktur von Tabelle js_hmi_config.html
CREATE TABLE IF NOT EXISTS `html` (
  `key` varchar(384) NOT NULL,
  `value_de` mediumtext DEFAULT NULL,
  `value_en` mediumtext DEFAULT NULL,
  `value_es` mediumtext DEFAULT NULL,
  `value_fr` mediumtext DEFAULT NULL,
  `value_it` mediumtext DEFAULT NULL,
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- Daten-Export vom Benutzer nicht ausgewählt

-- Exportiere Struktur von Tabelle js_hmi_config.jsonfx
CREATE TABLE IF NOT EXISTS `jsonfx` (
  `key` varchar(384) NOT NULL,
  `value` mediumtext NOT NULL,
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- Daten-Export vom Benutzer nicht ausgewählt

-- Exportiere Struktur von Tabelle js_hmi_config.label
CREATE TABLE IF NOT EXISTS `label` (
  `key` varchar(384) NOT NULL,
  `value_de` tinytext DEFAULT NULL,
  `value_en` tinytext DEFAULT NULL,
  `value_es` tinytext DEFAULT NULL,
  `value_fr` tinytext DEFAULT NULL,
  `value_it` tinytext DEFAULT NULL,
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- Daten-Export vom Benutzer nicht ausgewählt

-- Exportiere Struktur von Tabelle js_hmi_config.task
CREATE TABLE IF NOT EXISTS `task` (
  `key` varchar(384) NOT NULL,
  `taskObject` varchar(384) NOT NULL,
  `flags` tinyint(4) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `cycleIntervalMillis` int(11) NOT NULL,
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

-- Daten-Export vom Benutzer nicht ausgewählt

-- Exportiere Struktur von Tabelle js_hmi_config.text
CREATE TABLE IF NOT EXISTS `text` (
  `key` varchar(384) NOT NULL,
  `value` mediumtext NOT NULL,
  UNIQUE KEY `key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci ROW_FORMAT=COMPACT;

-- Daten-Export vom Benutzer nicht ausgewählt

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
