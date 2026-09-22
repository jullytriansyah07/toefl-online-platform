-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 22, 2026 at 10:30 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.1.25

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `toefl_platform`
--

-- --------------------------------------------------------

--
-- Table structure for table `student_scores`
--

CREATE TABLE `student_scores` (
  `id` int(11) NOT NULL,
  `student_name` varchar(100) NOT NULL,
  `question` text NOT NULL,
  `transcript` text NOT NULL,
  `score` int(11) NOT NULL,
  `feedback` text DEFAULT NULL,
  `exam_date` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `student_scores`
--

INSERT INTO `student_scores` (`id`, `student_name`, `question`, `transcript`, `score`, `feedback`, `exam_date`) VALUES
(1, 'Jully Triansyah', 'If you could invent something new, what product would you develop? Use specific details to explain why this invention is needed.', ' Al-Fatiha.', 2, 'Your response does not address the prompt and lacks any development.', '2026-09-22 08:02:08'),
(2, 'ju', 'Some students prefer to take online classes, while others prefer traditional face-to-face classes. Which do you prefer and why?', ' Allahumma sali salatan, kamilatau salim salama, tamala sayidina muhammadin filladhi, Tanhanu bihi lukotu Tanufaidu bihi lukotu Wahusnagi bihula ibu Ulima tulimin Was\'u bihi fil kulli', 1, 'Your response does not address the prompt and is not in English, so it cannot be evaluated for content or language use.', '2026-09-22 08:06:54'),
(3, 'ju', 'Some students prefer to take online classes, while others prefer traditional face-to-face classes. Which do you prefer and why?', ' Allahumma sali salatan, kamilatau salim salama, tamala sayidina muhammadin filladhi, Alhamdulillah. Al Fatiha. O\'er the land of the free and the home of the brave?', 2, 'Your response does not address the prompt and lacks relevant content.', '2026-09-22 08:06:54');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `student_scores`
--
ALTER TABLE `student_scores`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `student_scores`
--
ALTER TABLE `student_scores`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
