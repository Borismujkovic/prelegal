"""The guarantee that a turn never leaves the user guessing.

A pure function, so it is tested as one. `tests/test_documents_chat.py` and
`tests/test_assistant_chat.py` each carry one test proving it is actually wired
into the request path — correct in isolation is not the same as reached.
"""

from prelegal.conversation import FALLBACK_QUESTION, ensure_follow_up_question


def test_a_turn_that_needs_more_but_did_not_ask_gets_a_question() -> None:
    reply = ensure_follow_up_question("Noted, I have recorded Delaware.", True)

    assert reply.endswith("?")
    assert FALLBACK_QUESTION in reply


def test_the_original_wording_survives_the_appended_question() -> None:
    reply = ensure_follow_up_question("Noted, I have recorded Delaware.", True)

    assert reply.startswith("Noted, I have recorded Delaware.")


def test_a_turn_that_already_asked_is_left_exactly_as_it_was() -> None:
    original = "Who is the other side?"

    assert ensure_follow_up_question(original, True) == original


def test_trailing_whitespace_does_not_hide_a_question_mark() -> None:
    assert ensure_follow_up_question("Who signs for Acme?  \n", True).rstrip() == (
        "Who signs for Acme?"
    )


def test_a_full_width_question_mark_counts_as_a_question() -> None:
    original = "誰が署名しますか？"

    assert ensure_follow_up_question(original, True) == original


def test_a_finished_document_is_never_forced_to_ask_anything() -> None:
    """The closing turn is the one place a flat statement is the right answer."""
    original = "That is everything — you can download it from the preview."

    assert ensure_follow_up_question(original, False) == original
