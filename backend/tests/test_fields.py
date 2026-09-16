"""Reading a document's field set out of its Standard Terms.

Exercised against hand-written snippets rather than the real templates: these
are the parser's edge cases, and a snippet states the case being tested far more
plainly than a 40KB agreement that happens to contain it.
`tests/test_document_specs.py` is where the real files get read.
"""

from prelegal.fields import derive_field_names, normalise_field_name


def span(css_class: str, text: str) -> str:
    return f'<span class="{css_class}_link">{text}</span>'


def test_a_span_names_a_field() -> None:
    assert derive_field_names(f"during the {span('orderform', 'Pilot Period')}") == [
        "Pilot Period"
    ]


def test_a_possessive_names_the_same_field_as_its_bare_form() -> None:
    """The templates inflect these in prose; `Provider` and `Provider's` are one
    value, and reading them as two would leave an overlay unable to match.

    The curly apostrophe is the one the AI Addendum actually uses.
    """
    markdown = f"{span('coverpage', 'Provider')} and {span('coverpage', 'Provider’s')}"

    assert derive_field_names(markdown) == ["Provider"]


def test_a_straight_apostrophe_is_handled_too() -> None:
    possessive = span("keyterms", "Partner's")
    markdown = f"{span('keyterms', 'Partner')} {possessive}"

    assert derive_field_names(markdown) == ["Partner"]


def test_every_span_class_is_read_not_only_one() -> None:
    """The SLA mixes orderform and coverpage spans in a single file, so reading
    only the class a document is nominally filed under would lose half of it."""
    markdown = (
        f"{span('orderform', 'Target Uptime')} {span('coverpage', 'Provider')} "
        f"{span('keyterms', 'Governing Law')} {span('businessterms', 'Territory')} "
        f"{span('sow', 'Deliverables')}"
    )

    assert derive_field_names(markdown) == [
        "Target Uptime",
        "Provider",
        "Governing Law",
        "Territory",
        "Deliverables",
    ]


def test_a_field_nested_inside_bold_is_still_found() -> None:
    """The Pilot Agreement's liability cap is written this way. Scanning the raw
    markdown rather than a parsed tree is what makes this case free here."""
    markdown = f"**liability will not be more than the {span('orderform', 'General Cap Amount')}.**"

    assert derive_field_names(markdown) == ["General Cap Amount"]


def test_fields_come_back_in_first_use_order_without_repeats() -> None:
    markdown = (
        f"{span('keyterms', 'Provider')} {span('keyterms', 'Partner')} "
        f"{span('keyterms', 'Provider')}"
    )

    assert derive_field_names(markdown) == ["Provider", "Partner"]


def test_numbering_spans_are_not_mistaken_for_fields() -> None:
    """`header_2`, `header_3` and bare `<span id>` carry structure, not values."""
    markdown = (
        '1. <span class="header_2" id="1">Uptime</span> '
        '<span id="4.1">**"Available Minutes"**</span> means something.'
    )

    assert derive_field_names(markdown) == []


def test_text_with_no_spans_yields_no_fields() -> None:
    assert derive_field_names("Just prose, no substitutions.") == []


def test_normalising_trims_surrounding_whitespace() -> None:
    assert normalise_field_name("  Governing Law  ") == "Governing Law"
