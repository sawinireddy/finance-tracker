package com.example.finance.repo;

import com.example.finance.model.Transaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface TransactionRepository extends JpaRepository<Transaction, Long> {

    @Query("select t from Transaction t where " +
            "(:q is null or lower(t.merchant) like lower(concat('%', :q, '%')) " +
            "   or lower(t.category) like lower(concat('%', :q, '%')) " +
            "   or lower(t.notes) like lower(concat('%', :q, '%'))) " +
            "and (:fromDate is null or t.date >= :fromDate) " +
            "and (:toDate is null or t.date <= :toDate) " +
            "and (:cat is null or lower(t.category) = lower(:cat))")
    List<Transaction> search(@Param("q") String q,
                             @Param("fromDate") LocalDate fromDate,
                             @Param("toDate") LocalDate toDate,
                             @Param("cat") String category);

    List<Transaction> findByDateBetween(LocalDate start, LocalDate end);
}
